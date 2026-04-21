import { useLibp2pContext } from '@/context/ctx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Message } from '@libp2p/interface-pubsub';
import { CHAT_FILE_TOPIC, CHAT_TOPIC, FILE_EXCHANGE_PROTOCOL } from '@/lib/constants';
import { createIcon } from '@download/blockies';
import { ChatMessage, useChatContext } from '../context/chat-ctx';
import { v4 as uuidv4 } from 'uuid';
import { ChatFile, useFileChatContext } from '@/context/file-ctx';
import { pipe } from 'it-pipe';
import map from 'it-map';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import * as lp from 'it-length-prefixed';
import '../styles/chat.module.css';

interface MessageProps extends ChatMessage { }

function Message({ msg, fileObjectUrl, from, peerId }: MessageProps) {
  const msgref = React.useRef<HTMLLIElement>(null);
  const { libp2p } = useLibp2pContext();

  useEffect(() => {
    const icon = createIcon({
      seed: peerId,
      size: 15,
      scale: 3,
    });
    icon.className = 'rounded mr-2 max-h-10 max-w-10';
    const childrenCount = msgref.current?.childElementCount;
    if (childrenCount && childrenCount < 2) {
      msgref.current?.insertBefore(icon, msgref.current?.firstChild);
    }
  }, [peerId]);

  return (
    <li ref={msgref} className={`flex ${from === 'me' ? 'justify-end' : 'justify-start'}`}>
      <div className="flex relative max-w-xl px-4 py-2 text-gray-700 rounded shadow bg-white">
        <div className="block">
          {msg}
          <p>{fileObjectUrl ? <a href={fileObjectUrl} target="_blank" rel="noopener noreferrer"><b>Download</b></a> : ""}</p>
          <p className="italic text-gray-400">{peerId !== libp2p.peerId.toString() ? `from: ${peerId.slice(-4)}` : null} </p>
        </div>
      </div>
    </li>
  );
}

export default function ChatContainer() {
  const { libp2p } = useLibp2pContext();
  const { messageHistory, setMessageHistory } = useChatContext();
  const { files, setFiles } = useFileChatContext();
  const [input, setInput] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Effect hook to subscribe to pubsub events and update the message state hook
  useEffect(() => {
    const messageCB = async (evt: CustomEvent<Message>) => {
      console.log('gossipsub console log', evt.detail)
      // FIXME: Why does 'from' not exist on type 'Message'?
      const { topic, data } = evt.detail

      switch (topic) {
        case CHAT_TOPIC: {
          chatMessageCB(evt, topic, data)
          break
        }
        case CHAT_FILE_TOPIC: {
          chatFileMessageCB(evt, topic, data)
          break
        }
        default: {
          throw new Error(`Unexpected gossipsub topic: ${topic}`)
        }
      }
    }

    const chatMessageCB = (evt: CustomEvent<Message>, topic: string, data: Uint8Array) => {
      const msg = new TextDecoder().decode(data)
      console.log(`${topic}: ${msg}`)

      // Append signed messages, otherwise discard
      if (evt.detail.type === 'signed') {
        setMessageHistory([...messageHistory, { msg, fileObjectUrl: undefined, from: 'other', peerId: evt.detail.from.toString() }])
      }
    }

    const chatFileMessageCB = async (evt: CustomEvent<Message>, topic: string, data: Uint8Array) => {
      const fileId = new TextDecoder().decode(data)

      // if the message isn't signed, discard it.
      if (evt.detail.type !== 'signed') {
        return
      }
      const senderPeerId = evt.detail.from;

      const stream = await libp2p.dialProtocol(senderPeerId, FILE_EXCHANGE_PROTOCOL)
      await pipe(
        [uint8ArrayFromString(fileId)],
        (source) => lp.encode(source),
        stream,
        (source) => lp.decode(source),
        async function(source) {
          for await (const data of source) {
            const body: Uint8Array = data.subarray()
            console.log(`request_response: response received: size:${body.length}`)

            const msg: ChatMessage = {
              msg: newChatFileMessage(fileId, body),
              fileObjectUrl: window.URL.createObjectURL(new Blob([body])),
              from: 'other',
              peerId: senderPeerId.toString(),
            }
            setMessageHistory([...messageHistory, msg])
          }
        }
      )
    }

    libp2p.services.pubsub.addEventListener('message', messageCB)

    libp2p.handle(FILE_EXCHANGE_PROTOCOL, ({ stream }) => {
      pipe(
        stream.source,
        (source) => lp.decode(source),
        (source) => map(source, async (msg) => {
          const fileId = uint8ArrayToString(msg.subarray())
          const file = files.get(fileId)!
          return file.body
        }),
        (source) => lp.encode(source),
        stream.sink,
      )
    })

    return () => {
      (async () => {
        // Cleanup handlers 👇
        // libp2p.services.pubsub.unsubscribe(CHAT_TOPIC)
        // libp2p.services.pubsub.unsubscribe(CHAT_FILE_TOPIC)
        libp2p.services.pubsub.removeEventListener('message', messageCB)
        await libp2p.unhandle(FILE_EXCHANGE_PROTOCOL)
      })();
    }
  }, [libp2p, messageHistory, setMessageHistory, files])

  const sendMessage = useCallback(async () => {
    if (input === '') return

    console.log(
      `peers in gossip for topic ${CHAT_TOPIC}:`,
      libp2p.services.pubsub.getSubscribers(CHAT_TOPIC).toString(),
    )

    const res = await libp2p.services.pubsub.publish(
      CHAT_TOPIC,
      new TextEncoder().encode(input),
    )
    console.log(
      'sent message to: ',
      res.recipients.map((peerId) => peerId.toString()),
    )

    const myPeerId = libp2p.peerId.toString()

    setMessageHistory([...messageHistory, { msg: input, fileObjectUrl: undefined, from: 'me', peerId: myPeerId }])
    setInput('')
  }, [input, messageHistory, setInput, libp2p, setMessageHistory])

  const sendFile = useCallback(async (readerEvent: ProgressEvent<FileReader>) => {
    const fileBody = readerEvent.target?.result as ArrayBuffer;

    const myPeerId = libp2p.peerId.toString()
    const file: ChatFile = {
      id: uuidv4(),
      body: new Uint8Array(fileBody),
      sender: myPeerId,
    }
    setFiles(files.set(file.id, file))

    console.log(
      `peers in gossip for topic ${CHAT_FILE_TOPIC}:`,
      libp2p.services.pubsub.getSubscribers(CHAT_FILE_TOPIC).toString(),
    )

    const res = await libp2p.services.pubsub.publish(
      CHAT_FILE_TOPIC,
      new TextEncoder().encode(file.id)
    )
    console.log(
      'sent file to: ',
      res.recipients.map((peerId) => peerId.toString()),
    )

    const msg: ChatMessage = {
      msg: newChatFileMessage(file.id, file.body),
      fileObjectUrl: window.URL.createObjectURL(new Blob([file.body])),
      from: 'me',
      peerId: myPeerId,
    }
    setMessageHistory([...messageHistory, msg])
  }, [messageHistory, libp2p, setMessageHistory, files, setFiles])

  const newChatFileMessage = (id: string, body: Uint8Array) => {
    return `File: ${id} (${body.length} bytes)`
  }

  const handleKeyUp = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') {
        return
      }
      sendMessage()
    },
    [sendMessage],
  )

  const handleSend = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      sendMessage()
    },
    [sendMessage],
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value)
    },
    [setInput],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const reader = new FileReader();
        reader.readAsArrayBuffer(e.target.files[0]);
        reader.onload = (readerEvent) => {
          sendFile(readerEvent)
        };
      }
    },
    [sendFile],
  )

  const handleFileSend = useCallback(
    async (_e: React.MouseEvent<HTMLButtonElement>) => {
      fileRef?.current?.click();
    },
    [fileRef],
  )

  return (
    <div className="container mx-auto">
      <div className="min-w-full border rounded lg:grid lg:grid-cols-3">
        {/* RoomList component (if any) */}
        <div className="lg:col-span-3 lg:block">
          <div className="w-full">
            <div className="relative flex items-center p-3 border-b border-gray-300">
              <span className="text-3xl">✨👾✨</span>
              <span className="block ml-2 font-bold text-gray-600"></span>
            </div>
            <div className="relative w-full flex flex-col-reverse p-6 overflow-y-auto h-[40rem] bg-gray-100">
              <ul className="space-y-2">
                {messageHistory.map(({ msg, fileObjectUrl, from, peerId }, idx) => (
                  <Message key={idx} msg={msg} fileObjectUrl={fileObjectUrl} from={from} peerId={peerId} />
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between w-full p-3 border-t border-gray-300">
              <input ref={fileRef} className="hidden" type="file" onChange={handleFileInput} />
              <button className="file-upload-button" onClick={handleFileSend}>📁</button>
              <input
                value={input}
                onKeyUp={handleKeyUp}
                onChange={handleInput}
                type="text"
                placeholder="Message"
                className="chat-input"
                name="message"
                required
              />
              <button className="send-button" onClick={handleSend}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
