export const DEFAULT_FACTORY_CAREERS_CLI_CLIENT_ID = "factory-careers-cli";

export function isFactoryCareersCliClient(
  clientId: string,
  expectedClientId = DEFAULT_FACTORY_CAREERS_CLI_CLIENT_ID,
): boolean {
  return clientId === expectedClientId;
}
