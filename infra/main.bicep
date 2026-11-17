// Wordbridge on Azure: everything the app needs, in one resource group.
//
//   Container Apps (Next.js) ──► Azure Database for PostgreSQL Flexible Server (dictionary)
//                            └─► Azure Cosmos DB for MongoDB, serverless (submissions)
//   Azure Container Registry ◄── GitHub Actions pushes images; the app pulls with a managed identity
//
// Deploy:  az deployment group create -g <rg> -f infra/main.bicep -p infra/main.bicepparam
// See docs/azure.md for the full walkthrough.

targetScope = 'resourceGroup'

@description('Short lowercase prefix for resource names, e.g. "wordbridge".')
@minLength(3)
@maxLength(12)
param prefix string = 'wordbridge'

param location string = resourceGroup().location

@description('PostgreSQL admin password. Use letters and digits only (it goes into a connection URL).')
@secure()
param postgresPassword string

@description('Moderator logins as "name:token" pairs, comma-separated.')
@secure()
param moderatorTokens string

@description('Image to run. The first deployment uses a placeholder until CI pushes the real image.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Load the starter dictionary on start (idempotent).')
param seed bool = true

var suffix = uniqueString(resourceGroup().id)
var postgresAdmin = 'wbadmin'

// ---------------------------------------------------------------- monitoring

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ---------------------------------------------------------------- registry + identity

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}acr${suffix}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-app-identity'
  location: location
}

var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRole)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRole
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------- PostgreSQL (dictionary)

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${suffix}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdmin
    administratorLoginPassword: postgresPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'wordbridge'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Fuzzy search needs pg_trgm; Azure only lets allow-listed extensions be created.
resource pgExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: { value: 'PG_TRGM', source: 'user-override' }
}

// 0.0.0.0 → 0.0.0.0 is Azure's "allow access from Azure services" rule (Container Apps egress).
resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// ---------------------------------------------------------------- Cosmos DB for MongoDB (submissions)

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: '${prefix}-mongo-${suffix}'
  location: location
  kind: 'MongoDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [ { locationName: location, failoverPriority: 0 } ]
    capabilities: [ { name: 'EnableServerless' }, { name: 'EnableMongo' } ]
    apiProperties: { serverVersion: '6.0' }
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    minimalTlsVersion: 'Tls12'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases@2024-11-15' = {
  parent: cosmos
  name: 'wordbridge'
  properties: { resource: { id: 'wordbridge' } }
}

// ---------------------------------------------------------------- Container Apps

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-app'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [ acrPull, postgresDb, pgExtensions, pgAllowAzure, cosmosDb ]
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [ { server: registry.properties.loginServer, identity: identity.id } ]
      secrets: [
        {
          name: 'database-url'
          value: 'postgres://${postgresAdmin}:${postgresPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/wordbridge'
        }
        { name: 'mongodb-uri', value: cosmos.listConnectionStrings().connectionStrings[0].connectionString }
        { name: 'moderator-tokens', value: moderatorTokens }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'PGSSLMODE', value: 'require' }
            { name: 'MONGODB_URI', secretRef: 'mongodb-uri' }
            { name: 'MONGODB_DB', value: 'wordbridge' }
            { name: 'MODERATOR_TOKENS', secretRef: 'moderator-tokens' }
            { name: 'SEED', value: seed ? '1' : '0' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 3000 }
              initialDelaySeconds: 20
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0 // scale to zero when idle: the first request after a pause takes a few seconds
        maxReplicas: 3
        rules: [ { name: 'http', http: { metadata: { concurrentRequests: '50' } } } ]
      }
    }
  }
}

output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output containerAppName string = app.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
