export function createNextRequestId(currentLatestRequestId: number): number {
  return currentLatestRequestId + 1
}

export function shouldApplyRequestResult(
  requestId: number,
  latestRequestId: number
): boolean {
  return requestId === latestRequestId
}
