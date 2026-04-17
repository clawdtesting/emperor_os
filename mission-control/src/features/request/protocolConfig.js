/** @typedef {'agijob_v1'|'agijob_v2'|'prime_v1'|'prime_v2'} ProtocolType */

/**
 * @typedef {Object} ProtocolOption
 * @property {ProtocolType} id
 * @property {string} label
 * @property {string} description
 * @property {string} contractAddress
 * @property {string} spenderAddress
 */

/** @type {ProtocolOption[]} */
export const PROTOCOL_OPTIONS = [
  {
    id: 'agijob_v1',
    label: 'AGIJobManager v1',
    description: 'Standard direct job posting flow for normal work requests.',
    contractAddress: '0xb3aaeb69b630f0299791679c063d68d6687481d1',
    spenderAddress: '0xb3aaeb69b630f0299791679c063d68d6687481d1',
  },
  {
    id: 'agijob_v2',
    label: 'AGIJobManager v2',
    description: 'Updated job flow with newer contract path and parameters.',
    contractAddress: '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2',
    spenderAddress: '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2',
  },
  {
    id: 'prime_v1',
    label: 'AGIJobDiscoveryPrime v1',
    description: 'Procurement-style flow for more structured competitive job discovery.',
    contractAddress: '0xd5ef1dde7ac60488f697ff2a7967a52172a78f29',
    spenderAddress: '0xd5ef1dde7ac60488f697ff2a7967a52172a78f29',
  },
  {
    id: 'prime_v2',
    label: 'AGIJobDiscoveryPrime v2',
    description: 'Next-generation procurement lane with the strict Prime v2 contract mapping.',
    contractAddress: '0xf8fc6572098ddcac4560e17ca4a683df30ea993e',
    spenderAddress: '0xf8fc6572098ddcac4560e17ca4a683df30ea993e',
  },
]

/**
 * @param {ProtocolType | '' | null | undefined} id
 * @returns {ProtocolOption | null}
 */
export function getProtocolOption(id) {
  return PROTOCOL_OPTIONS.find(option => option.id === id) || null
}
