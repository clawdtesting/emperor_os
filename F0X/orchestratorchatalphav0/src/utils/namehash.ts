import Web3 from 'web3';

export const namehash = (name: string): string => {
    const web3 = new Web3();
    let node = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (name) {
        const labels = name.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
            let labelHash = web3.utils.keccak256(labels[i]);
            node = web3.utils.keccak256(node + labelHash.substring(2));
        }
    }
    return node;
};
