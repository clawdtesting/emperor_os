import { useMemo } from 'react'

import { buildPlatformSummary, validatePlatformDataset } from '../models/platform.js'
import { PLATFORM_SEED_DATA } from '../state/platform-seed.js'

export function usePlatformData() {
  return useMemo(() => {
    const validation = validatePlatformDataset(PLATFORM_SEED_DATA)

    return {
      data: PLATFORM_SEED_DATA,
      summary: buildPlatformSummary(PLATFORM_SEED_DATA),
      validation,
    }
  }, [])
}
