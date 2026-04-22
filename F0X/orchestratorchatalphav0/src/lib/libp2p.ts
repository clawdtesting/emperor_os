import { bootstrap } from '@libp2p/bootstrap'
import { kadDHT } from '@libp2p/kad-dht'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { webTransport } from '@libp2p/webtransport'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import type { Connection } from '@libp2p/interface/connection'
import type { Multiaddr } from '@multiformats/multiaddr'
import { createLibp2p, type Libp2p } from 'libp2p'

import {
  CHAT_FILE_TOPIC,
  CHAT_TOPIC,
  CIRCUIT_RELAY_CODE,
  WEBRTC_BOOTSTRAP_NODE,
  WEBTRANSPORT_BOOTSTRAP_NODE,
} from './constants'

export {
  CHAT_FILE_TOPIC,
  CHAT_TOPIC,
  CIRCUIT_RELAY_CODE,
  FILE_EXCHANGE_PROTOCOL,
  WEBRTC_BOOTSTRAP_NODE,
  WEBTRANSPORT_BOOTSTRAP_NODE,
} from './constants'

export async function startLibp2p(): Promise<Libp2p> {
  const bootstrapList = [WEBRTC_BOOTSTRAP_NODE, WEBTRANSPORT_BOOTSTRAP_NODE].filter(Boolean)

  const node = await createLibp2p({
    addresses: {
      listen: ['/webrtc', '/wss', '/webtransport'],
    },
    transports: [webRTC(), webTransport(), webSockets()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: bootstrapList.length
      ? [
          bootstrap({
            list: bootstrapList,
          }),
        ]
      : [],
    services: {
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
      }),
      dht: kadDHT(),
    },
    connectionGater: {
      denyDialMultiaddr: async (ma: Multiaddr) => {
        return ma.protoCodes().includes(CIRCUIT_RELAY_CODE)
      },
    },
  })

  await node.start()

  await node.services.pubsub.subscribe(CHAT_TOPIC)
  await node.services.pubsub.subscribe(CHAT_FILE_TOPIC)

  return node
}

export const connectToMultiaddr =
  (libp2p: Libp2p) =>
  async (addr: Multiaddr): Promise<Connection> => {
    return libp2p.dial(addr)
  }
