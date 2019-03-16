var config = {};

// self explanatory, your application name, descriptions, etc
config.appName = 'OscillateCoin Wallet';
config.appDescription = 'OscillateCoin Wallet';
config.appSlogan = 'Slow and steady wins the race!';
config.appId = 'mawr.oscillatecoin.wallet';
config.appGitRepo = 'https://github.com/oscillate-dev/oscillate-wallet';

// default port number for your daemon (e.g. oscillated)
config.daemonDefaultRpcPort = 11246;

// wallet file created by this app will have this extension
config.walletFileDefaultExt = 'wallet';

// change this to match your wallet service executable filename
config.walletServiceBinaryFilename = 'oscillate-service';

// version on the bundled service (oscillate-service)
config.walletServiceBinaryVersion = "v0.13.0";

// config file format supported by wallet service, possible values:
// ini -->  for turtle service (or its forks) version <= v0.8.3
// json --> for turtle service (or its forks) version >= v0.8.4
config.walletServiceConfigFormat = "json";

// default port number for your wallet service (e.g. oscillate-service)
config.walletServiceRpcPort = 8070;

// block explorer url, the [[TX_HASH]] will be substituted w/ actual transaction hash
config.blockExplorerUrl = 'http://oscillate-explorer.sytes.net/?hash=[[TX_HASH]]#blockchain_transaction';

// default remote node to connect to, set this to a known reliable node for 'just works' user experience
config.remoteNodeDefaultHost = '134.209.75.124:11246';

// remote node list update url, set to null if you don't have one
config.remoteNodeListUpdateUrl = 'http://osc.line-pool.ru/nodes.json';

// fallback remote node list, in case fetching update failed, fill this with known to works remote nodes
config.remoteNodeListFallback = [
  "134.209.75.124:11246",
  "134.209.67.236:11246",
  'localhost:11246',
];

// your currency name
config.assetName = 'OscillateCoin';
// your currency ticker
config.assetTicker = 'OSC';
// your currency address prefix, for address validation
config.addressPrefix = 'hannw';
// standard wallet address length, for address validation
config.addressLength = 99;
// integrated wallet address length, for address validation. Added length is length of payment ID encoded in base58.
config.integratedAddressLength = config.addressLength + ((64 * 11) / 8);

// minimum fee for sending transaction
config.minimumFee = 0.1;
// minimum amount for sending transaction
config.mininumSend = 0.1;
// default mixin/anonimity for transaction
config.defaultMixin = 3;
// to represent human readable value
config.decimalPlaces = 2;
// to convert from atomic unit
config.decimalDivisor = 10 ** config.decimalPlaces;

// obfuscate address book entries, set to false if you want to save it in plain json file.
// not for security because the encryption key is attached here
config.addressBookObfuscateEntries = true;
// key use to obfuscate address book contents
config.addressBookObfuscationKey = '79009fb00ca1b7130832a42de45142cf6c4b7f333fe6fba5';
// initial/sample entries to fill new address book
config.addressBookSampleEntries = [
  {
    name: 'WalletShell Donation',
    address: 'hannwSZzDLwFMxPy1PKKFgaFvhvVUjnxThEatTarKM7bBVfvGBdqRuRZ75NcZQWMY55g3MPRZSdrdMnWn2qdLPQYVSQJBobPXPH',
    paymentId: '',
  }
];
// cipher config for private address book
config.addressBookCipherConfig = {
  algorithm: 'aes-256-gcm',
  saltLenght: 128,
  pbkdf2Rounds: 10000,
  pbkdf2Digest: 'sha512'
};

module.exports = config;
