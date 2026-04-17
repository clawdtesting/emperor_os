import test from 'node:test'
import assert from 'node:assert/strict'

import { CONTRACTS } from './abi-registry.js'

test('strict contract address map matches current production contracts', () => {
  assert.equal(CONTRACTS.AGI_JOB_MANAGER_V1, '0xB3AAeb69b630f0299791679c063d68d6687481d1')
  assert.equal(CONTRACTS.AGI_JOB_MANAGER_V2, '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2')
  assert.equal(CONTRACTS.AGI_PRIME_V1, '0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29')
  assert.equal(CONTRACTS.AGI_PRIME_V2, '0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e')
})
