const ERROR = "Legacy signing/broadcast path is disabled. Use unsigned tx packages + operator MetaMask/Ledger signing.";

export const address = () => {
  throw new Error(ERROR);
};

export async function broadcast() {
  throw new Error(ERROR);
}

export async function broadcastMcpTx() {
  throw new Error(ERROR);
}
