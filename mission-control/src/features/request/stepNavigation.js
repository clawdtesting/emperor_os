export function shouldAutoScrollToStep({ previousStep, nextStep } = {}) {
  if (!Number.isInteger(previousStep) || !Number.isInteger(nextStep)) return false
  return nextStep > previousStep
}
