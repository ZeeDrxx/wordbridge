using './main.bicep'

param prefix = 'wordbridge'
// Secrets come from the environment, never from this file:
//   export WB_PG_PASSWORD=$(openssl rand -hex 20)
//   export WB_MODERATORS="yourname:$(openssl rand -hex 24)"
param postgresPassword = readEnvironmentVariable('WB_PG_PASSWORD')
param moderatorTokens = readEnvironmentVariable('WB_MODERATORS')
