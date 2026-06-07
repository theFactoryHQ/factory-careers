type PublicAiConfigRow = {
  apiKeyEncrypted?: string | null
  inputPricePer1m?: string | number | null
  outputPricePer1m?: string | number | null
}

export function toPublicAiConfig<T extends PublicAiConfigRow>(row: T) {
  const { apiKeyEncrypted, ...rest } = row
  return {
    ...rest,
    inputPricePer1m: rest.inputPricePer1m != null ? Number(rest.inputPricePer1m) : null,
    outputPricePer1m: rest.outputPricePer1m != null ? Number(rest.outputPricePer1m) : null,
    hasApiKey: Boolean(apiKeyEncrypted),
  }
}