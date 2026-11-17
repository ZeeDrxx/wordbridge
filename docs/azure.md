# Deploying Wordbridge on Azure

| Piece | Azure service | Why |
|---|---|---|
| Next.js app | **Container Apps** | Runs the Docker image, HTTPS included, scales to zero when idle |
| Dictionary | **Azure Database for PostgreSQL – Flexible Server** (Burstable B1ms) | Managed Postgres with `pg_trgm` for fuzzy search |
| Submissions | **Azure Cosmos DB for MongoDB** (serverless) | MongoDB wire protocol, pay per request: suits a low-traffic moderation queue |
| Images | **Azure Container Registry** (Basic) | CI pushes here; the app pulls with a managed identity (no registry password) |
| Logs | **Log Analytics** | Container logs, queryable with KQL |

Everything is declared in [`infra/main.bicep`](../infra/main.bicep).

## 1. Prerequisites

- An Azure subscription. Students can use **Azure for Students** (free credit, no card).
- The Azure CLI, signed in: `az login`.

## 2. Create the infrastructure

```bash
az group create -n wordbridge-rg -l francecentral

export WB_PG_PASSWORD=$(openssl rand -hex 20)              # letters + digits only
export WB_MODERATORS="yourname:$(openssl rand -hex 24)"    # keep this token: it is your moderator login

az deployment group create -g wordbridge-rg \
  -f infra/main.bicep -p infra/main.bicepparam \
  --query properties.outputs
```

The first deployment runs a placeholder image. Note the outputs: `registryName`, `containerAppName` and `appUrl`.

## 3. Ship the real image

**From your machine:**

```bash
az acr build -r <registryName> -t wordbridge:v1 .
az containerapp update -g wordbridge-rg -n wordbridge-app --image <registryName>.azurecr.io/wordbridge:v1
```

On start, the container applies the Drizzle migrations and loads the starter dictionary (`SEED=1`, idempotent).
Open `appUrl`, then `appUrl/moderate`, and sign in with the token from `WB_MODERATORS`.

**From GitHub Actions** (`.github/workflows/deploy-azure.yml`, runs on `v*` tags): let GitHub sign in to
Azure with OpenID Connect, so no secret is stored in GitHub.

```bash
APP_ID=$(az ad app create --display-name wordbridge-github --query appId -o tsv)
az ad sp create --id $APP_ID
az role assignment create --assignee $APP_ID --role Contributor \
  --scope $(az group show -n wordbridge-rg --query id -o tsv)
az ad app federated-credential create --id $APP_ID --parameters '{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<your-github-user>/wordbridge:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

In the GitHub repository, open **Settings → Environments → production → Variables** and add:
- `AZURE_CLIENT_ID` (`$APP_ID`)
- `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` (from `az account show`)
- `AZURE_RESOURCE_GROUP`, `AZURE_REGISTRY_NAME`, `AZURE_CONTAINER_APP`

## 4. Operate

```bash
# live logs
az containerapp logs show -g wordbridge-rg -n wordbridge-app --follow
# rotate moderator tokens
az containerapp secret set -g wordbridge-rg -n wordbridge-app --secrets moderator-tokens="amina:<token>,youssef:<token>"
az containerapp revision restart -g wordbridge-rg -n wordbridge-app --revision $(az containerapp revision list -g wordbridge-rg -n wordbridge-app --query "[0].name" -o tsv)
```

## Cost and limits

- **Cost:** for a hobby project, the PostgreSQL B1ms server is most of the bill. Stop it when you don't need it (`az postgres flexible-server stop`). Container Apps and serverless Cosmos DB cost close to nothing at low traffic.
- **Cosmos DB compatibility:** Cosmos DB for MongoDB does not support retryable writes. The client sets `retryWrites: false`, and the app only uses features Cosmos DB supports (single-document updates, compound indexes).
- **Public database access:** PostgreSQL accepts connections from Azure services through the `AllowAzureServices` firewall rule. For stricter isolation, put the Container Apps environment and the server in a VNet with private access. That needs a larger, non-consumption setup.

## Tear down

```bash
az group delete -n wordbridge-rg
```
