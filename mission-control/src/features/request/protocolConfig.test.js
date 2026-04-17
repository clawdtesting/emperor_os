import test from 'node:test'
import assert from 'node:assert/strict'

import { getProtocolOption } from './protocolConfig.js'

test('protocolConfig uses the corrected strict contract addresses', () => {
  assert.equal(getProtocolOption('agijob_v1')?.contractAddress, '0xb3aaeb69b630f0299791679c063d68d6687481d1')
  assert.equal(getProtocolOption('agijob_v2')?.contractAddress, '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2')
  assert.equal(getProtocolOption('prime_v1')?.contractAddress, '0xd5ef1dde7ac60488f697ff2a7967a52172a78f29')
  assert.equal(getProtocolOption('prime_v2')?.contractAddress, '0xf8fc6572098ddcac4560e17ca4a683df30ea993e')
})
