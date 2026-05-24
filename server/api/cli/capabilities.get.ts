import {
  CLI_API_CONTRACT_VERSION,
  CLI_CAPABILITIES_ROUTE,
  CLI_RESOURCE_GROUPS,
  MINIMUM_SUPPORTED_CLI_VERSION,
} from '~~/shared/cli-contract'
import { cliRouteCoverage } from '~~/packages/careers-cli/src/routeCoverage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  return {
    application: 'factory-careers',
    route: CLI_CAPABILITIES_ROUTE,
    contractVersion: CLI_API_CONTRACT_VERSION,
    minimumCliVersion: MINIMUM_SUPPORTED_CLI_VERSION,
    resourceGroups: CLI_RESOURCE_GROUPS,
    routes: cliRouteCoverage,
  }
})
