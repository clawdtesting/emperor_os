import Head from 'next/head';
import Nav from '@/components/nav';
import ChatContainer from '@/components/chat';
import { useEffect, useCallback } from 'react';
import Image from 'next/image';

export default function Chat() {
  return (
    <>
      <Head>
        <title>Elite Chat Parlor</title>
        <meta name="description" content="Engage in exquisite conversations within an elite circle" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="chat-main">
        <Nav />
        <div className="chat-interface">
          <ChatContainer />
        </div>
      </main>
      <style jsx>{`
        .chat-main {
          min-height: 100vh;
          font-family: 'Cambria', Cochin, Georgia, Times, 'Times New Roman', serif;
          background: #F5F5F5;
          padding: 50px;
        }

        .chat-interface {
          max-width: 1000px;
          margin: auto;
          padding: 50px;
          background: #FFF8DC;
          border-radius: 15px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
        }
        
        .luxury-button {
          background-color: #4B5563;
          color: #F9FAFB;
          padding: 10px 20px;
          margin: 5px;
          border: none;
          border-radius: 5px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.3s, transform 0.2s;
          display: flex;
          align-items: center;
        }

        .luxury-button:hover {
          background-color: #374151;
        }

        .luxury-button:active {
          transform: scale(0.98);
        }

        .button-icon {
          margin-right: 8px;
        }

        .chat-input {
          flex-grow: 1;
          border-radius: 20px;
          padding: 10px 20px;
          margin: 5px;
          border: 2px solid #E5E7EB;
        }
      `}</style>
    </>
  )
}

