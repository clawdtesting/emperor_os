// In src/global.d.ts
import { ExternalProvider } from 'web3-core';

declare global {
  interface Window {
    ethereum: ExternalProvider;
  }
}

