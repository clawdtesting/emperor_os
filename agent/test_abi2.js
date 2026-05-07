const { loadAbi } = require('./prime-client.js');
const abi = loadAbi();
console.log('Number of ABI items:', abi.length);
const functions = abi.filter(item => item.type === 'function');
console.log('Functions:');
functions.forEach(f => {
  console.log(f.name);
});
const iface = new (require('ethers')).Interface(abi);
console.log('Interface functions:');
iface.fragments.forEach(f => {
  if (f.type === 'function') {
    console.log(f.name);
  }
});