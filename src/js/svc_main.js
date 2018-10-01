const childProcess = require('child_process');
const execFile = childProcess.execFile;
const spawn = childProcess.spawn;
const path = require('path');
const svcRequest = require('./svc_request.js');
const uiUpdater = require('./ui_updater.js');
const Store = require('electron-store');
const settings = new Store({name: 'Settings'});
const gSession = require('./gsessions');
const wlsession = new gSession();
const log = require('electron-log');
const gutils = require('./gutils.js');

const ERROR_WALLETLAUNCH = 'Failed to start turtle-service. Set the path to turtle-service properly in the settings tab.';
const ERROR_WRONG_PASSWORD = 'Failed to load your wallet, please check your password';
const ERROR_WALLET_IMPORT = 'Import failed, please check that you have entered all information correctly';
const ERROR_WALLET_CREATE = 'Wallet can not be created, please check your input and try again';
//const ERROR_INVALID_PATH = 'Invalid directory/filename, please enter a valid path that you have write permission';

const SERVICE_LOG_DEBUG = wlsession.get('debug');
const SERVICE_LOG_LEVEL_DEFAULT = 0;
const SERVICE_LOG_LEVEL_DEBUG = 4;
const SERVICE_LOG_LEVEL = (SERVICE_LOG_DEBUG ? SERVICE_LOG_LEVEL_DEBUG : SERVICE_LOG_LEVEL_DEFAULT);

var serviceInitialized = false;
var the_service = null;
var the_cworker;
var serviceProcess;

// reset global vars
function resetGlobals(){
    wlsession.reset();
    onSectionChanged('reset-oy');
}

function doInit(){
    if(wlsession.get('configUpdated') || !serviceInitialized){
        serviceInitialized = true;
        wlsession.set('configUpdated', false);
        the_service = null;
    }

    if(the_service !== null) return;
    
    let cfg = {
        service_host: settings.get('service_host'),
        service_port: settings.get('service_port'),
        service_password: settings.get('service_password')
    }
    the_service = new svcRequest(cfg);
}

function isRunning() {
    return  (undefined !== serviceProcess && null !== serviceProcess);
}

// start entry point, to test if config ok, service runnable and pass is good
function startService(filePath, password, scanHeight, onError, onSuccess) {
    doInit();
    let file = path.basename(filePath);
    let directory = path.dirname(filePath);

    // test exec
    const ptest = execFile(
        settings.get('service_bin'), [
            '--rpc-password', settings.get('service_password'),
            '-w', path.join(directory, file),
            '-p', password,
            '--log-level', 0,
            '--address'
        ], (error, stdout, stderr) => {
            if(error){
                log.debug(error.message);
                onError(ERROR_WALLETLAUNCH);
            }else{
                if(stdout && stdout.length && stdout.indexOf('TRTL') !== -1){
                    let trimmed = stdout.trim();
                    let wa = trimmed.substring(trimmed.indexOf('TRTL'), trimmed.length);
                    wlsession.set('loadedWalletAddress', wa);
                    doRunService(filePath, password, scanHeight, onError, onSuccess);
                }else{
                    // just stop here
                    onError(ERROR_WRONG_PASSWORD);
                }
            }
        }
    );
}

function doRunService(filePath, password, scanHeight, onError, onSuccess) {
    doInit();

    let file = path.basename(filePath);
    let directory = path.dirname(filePath);
    let logFilename = `${file.split(' ').join('').split('.')[0]}.log`;
    let logFile = path.join(directory, logFilename);
    let walletFile = path.join(directory, file);
    let walletArgs = [
        '-w', walletFile,
        '-p', password,
        '--rpc-password', settings.get('service_password'),
        '--enable-cors', '*',
        '--daemon-address', settings.get('daemon_host'),
        '--daemon-port', settings.get('daemon_port'),
        '--log-level', SERVICE_LOG_LEVEL
    ];

    if(SERVICE_LOG_LEVEL > 0){
        walletArgs.push('--log-file');
        walletArgs.push(logFile);
    }

    // if(scanHeight && scanHeight > 1024) walletArgs = walletArgs.concat(['--scan-height', scanHeight]);
    log.debug('Starting service...');
    serviceProcess = spawn(settings.get('service_bin'), walletArgs);
    serviceProcess.on('close', function (code, signal) {
        log.debug(`turtle-service terminated by ${signal}, code: ${code}`);
        serviceProcess = null;
    });

    serviceProcess.on('error', function(err) {
        log.error(`turtle-service error: ${err.message}`);
        serviceProcess = null;
    });

    /* The process has been spawned, now we check if its running */
    var TEST_OK = false;
    if (isRunning()) {
        function testConnection(retry) {
            the_service.getAddress().then((address) => {
                if(!TEST_OK){
                    wlsession.set('loadedWalletAddress', address);
                    wlsession.set('serviceReady', true);
                    // start the worker here?
                    startWorker();
                    uiUpdater.updateUiState({ //move this to event listener
                        type: 'addressUpdated',
                        data: address
                    });
                    wlsession.set('connectedNode', `${settings.get('daemon_host')}:${settings.get('daemon_port')}`);
                    onSuccess(walletFile, scanHeight);
                    TEST_OK = true;
                }
                return true;
            }).catch((err) => {
                if(retry >= 12 && !TEST_OK){
                    onError(err);
                    return false;
                }else{
                    setTimeout(function(){
                        let nextTry = retry+1;
                        log.debug(`retrying testconn (${nextTry})`);
                        testConnection(nextTry);
                    },2000);
                }
            });
        }

        setTimeout(function(){
            testConnection(0);
        }, 5000);
    } else {
        log.debug('turtle-service not running');
        if(onError) onError(ERROR_WALLETLAUNCH);
    }
}

function startWorker(){
    the_cworker = childProcess.fork(
        path.join(__dirname,'./svc_worker.js')
    );

    the_cworker.on('message', (m) => {
        if(m.type === 'serviceStatus' ){
            the_cworker.send({
                type: 'start',
                data: {}
            });
            wlsession.set('serviceReady', true);
            wlsession.set('syncStarted', true);
        }else{
            handleWorkerUpdate(m);
        }
    });

    let cfgData = {
        type: 'cfg',
        data: {
            service_host: settings.get('service_host'),
            service_port: settings.get('service_port'),
            service_password: settings.get('service_password')
        },
        debug: SERVICE_LOG_DEBUG
    }

    the_cworker.send(cfgData);

    the_cworker.on('close', function (code, signal) {
        log.debug(`service worker terminated by ${signal}`);
        the_cworker = null;
    });

    the_cworker.on('exit', function (code, signal) {
        log.debug(`service worker terminated by ${signal}`);
        the_cworker = null;
    });

    the_cworker.on('error', function(err) {
        log.debug(`service worker error: ${err.message}`);
        try{the_cworker.kill('SIGKILL');}catch(e){}
    });
}

function stopWorker(){
    doInit();
    if(undefined === the_cworker || null === the_cworker) return;
    try{
        the_cworker.send({type: 'stop', data: {}});
        the_cworker.kill('SIGTERM');
        the_cworker = null;
    }catch(e){
        log.debug(`failed to stop cworker: ${e.message}`);
    }
}

function stopService(dokill) {
    dokill = dokill || false;
    doInit();
    let signal = 'SIGTERM';
    if(dokill) signal = 'SIGKILL';
    return new Promise(function (resolve) {
        if (isRunning()) {
            the_service.save().then(() =>{
                try{
                    serviceProcess.kill(signal);
                    resetGlobals();
                    resolve(true);
                }catch(err){
                    log.debug(`SIGTERM failed: ${err.message}`);
                    try{serviceProcess.kill('SIGKILL')}catch(e){}
                    resetGlobals();
                    resolve(false);
                }
            }).catch((err) => {
                log.debug(`Failed to save wallet:${err.message}`);
                try{
                    serviceProcess.kill('SIGKILL');
                    resetGlobals();
                    resolve(true);
                }catch(err){
                    log.debug(`SIGKILL FAILED : ${err.message}`);
                    resetGlobals();
                    resolve(false);
                }
            });
        } else {
            resetGlobals();
            resolve(false);
        }
    });
}

function getNodeFee(){
    the_service.getFeeInfo().then((res) => {
        // store
        let theFee = (res.amount / 100);
        wlsession.set('nodeFee', theFee);
        uiUpdater.updateUiState({ // move this to configUpdated listener
            type: 'nodeFeeUpdated',
            data: theFee
        });
        return theFee;
    }).catch((err) => {
        log.debug('failed to get node fee');
    });
}

function resetFromHeight(scanHeight){
    scanHeight = scanHeight || 0;
    let reset_params = {};
    if(scanHeight > 1024) reset_params.scanHeight = scanHeight;
    // this shit always return invalid request
    log.debug(`resetting from height ${scanHeight}`);
    the_service.reset(reset_params).then( () => {
        return true;
    }).catch((err) => {
        return true;
    });
}

function getSecretKeys(address){
    return new Promise((resolve, reject) => {
        if(!the_service) return reject('Service Not Running');
        the_service.getBackupKeys({address: address}).then((result) => {
            return resolve(result);
        }).catch((err) => {
            log.debug(`Failed to get keys: ${err.message}`);
            return reject(err);
        });
    });
}

function sendTransaction(params){
    return new Promise((resolve, reject) => {
        the_service.sendTransaction(params).then((result) => {
            return resolve(result);
        }).catch((err) => {
            return reject(err);
        });
    });
}

function createWallet (walletFile, password){
    return new Promise((resolve, reject) => {
        execFile(
            settings.get('service_bin'),
            [ '-g',  '-w', walletFile,  '-p', password,
              '--rpc-password', settings.get('service_password')
            ],
            (error, stdout, stderr) => {
                if (error) {
                    log.error(`Failed to create wallet: ${error.message}`);
                    return reject(new Error(ERROR_WALLET_CREATE));
                } else {
                    if(!gutils.isRegularFileAndWritable(walletFile)){
                        return reject(new Error(ERROR_WALLET_IMPORT));
                    }
                    return resolve(walletFile);
                }
            }
        );
    });
}

function importFromKey(walletFile, password, viewKey, spendKey, scanHeight) {
    return new Promise((resolve, reject) => {
        scanHeight = scanHeight || 0;

        let walletArgs = [
            '-g',
            '-w', walletFile,
            '-p', password,
            '--view-key', viewKey,
            '--spend-key', spendKey,
            '--rpc-password', settings.get('service_password')
        ];

        if(scanHeight > 1024) walletArgs = walletArgs.concat(['--scan-height',scanHeight]);

        execFile(
            settings.get('service_bin'),
            walletArgs,
            (error, stdout, stderr) => {
                if (error) {
                    log.debug(`Failed to import key: ${error.message}`);
                    return reject(new Error(ERROR_WALLET_IMPORT));
                } else {
                    if(!gutils.isRegularFileAndWritable(walletFile)){
                        return reject(new Error(ERROR_WALLET_IMPORT));
                    }
                    return resolve(walletFile);
                }
            }
        );

    });
}


function importFromSeed(walletFile, password, mnemonicSeed, scanHeight) {
    return new Promise((resolve, reject) => {
        scanHeight = scanHeight || 0;

        let walletArgs = [
            '-g',
            '-w', walletFile,
            '-p', password,
            '--mnemonic-seed', mnemonicSeed,
            '--rpc-password', settings.get('service_password')
        ];

        if(scanHeight > 1024) walletArgs = walletArgs.concat(['--scan-height',scanHeight]);

        execFile(
            settings.get('service_bin'),
            walletArgs,
            (error, stdout, stderr) => {
                if (error) {
                    log.debug(`Error importing seed: ${error.message}`);
                    return reject(new Error(ERROR_WALLET_IMPORT));
                } else {
                    if(!gutils.isRegularFileAndWritable(walletFile)){
                        return reject(new Error(ERROR_WALLET_IMPORT));
                    }
                    return resolve(walletFile);
                }
            }
        );
    });
}

function genIntegratedAddress(paymentId, address){
    return new Promise((resolve, reject) => {
        address = address || wlsession.get('loadedWalletAddress');
        the_service.createIntegratedAddress({address: address, paymentId: paymentId}).then((result) =>{
            return resolve(result)
        }).catch((err)=>{
            return reject(err);
        });
    });
    
}

let fusionTx = (() => {
    let txHash = [];
    const maxTxIter = 256;
    const maxThreshCheckIter = 20;
    const FUSION_DONE_MSG = 'Wallet optimization completed, your balance may appear incorrect for a while.';
    const FUSION_FAILED_MSG = 'Unable to optimize your wallet, please try again in a few seconds';
    const FUSION_SKIPPED_MSG = 'Wallet already optimized. No further optimization is needed.';

    let getMinThreshold = (threshold, minThreshold, maxFusionReadyCount, counter) => {
        return new Promise((resolve, reject) => {
            counter = counter || 0;
            threshold = threshold || (parseInt(wlsession.get('walletUnlockedBalance'),10)*100)+1;
            threshold = parseInt(threshold,10);
            minThreshold = minThreshold || threshold;
            maxFusionReadyCount = maxFusionReadyCount || 0;

            the_service.estimateFusion({threshold: threshold}).then((res)=>{
                // nothing to optimize
                if( counter === 0 && res.fusionReadyCount === 0) return resolve(0); 
                // stop at maxThreshCheckIter or when threshold too low
                if( counter > maxThreshCheckIter || threshold < 10) return resolve(minThreshold);
                // we got a possibly best minThreshold
                if(res.fusionReadyCount < maxFusionReadyCount){
                    return resolve(minThreshold);
                }
                // continue to find next best minThreshold
                maxFusionReadyCount = res.fusionReadyCount;
                minThreshold = threshold;
                threshold /= 2;
                counter += 1;
                resolve(getMinThreshold(threshold, minThreshold, maxFusionReadyCount, counter).then((res)=>{
                    return res;
                }));
            }).catch((err)=>{
                return reject(new Error(err));
            });
        });
    }
    let sendTx = (threshold, iter) => {
        return new Promise((resolve, reject) => {
            iter = iter || 0;
            if(iter >= maxTxIter) return resolve(txhash); // stop at max iter
            console.log('send fusion tx, iteration: ', iter);
            // keep sending fusion tx till it hit IOOR or reaching max iter 
            the_service.sendFusionTransaction({threshold: threshold}).then((resp)=> {
                txHash.push(resp.transactionHash);
                iter+=1;
                setTimeout(()=>{
                    return resolve(sendTx(threshold, iter).then((resp)=>{
                        return resp;
                    }));
                },100);
            }).catch((err)=>{
                return reject(new Error(err));
            });
        });
    }
    return {
        optimize: ()=>{
            return new Promise((resolve, reject) => {
                getMinThreshold().then((res)=>{
                    if(res > 0){
                        log.debug(`performing fusion tx, threshold: ${res}`);
                        return resolve(
                            sendTx(res).then((txhash) => {
                                return FUSION_DONE_MSG;
                            }).catch((err)=>{
                                let msg = err.message.toLowerCase();
                                switch(msg){
                                    case 'index is out of range':
                                        outMsg = txhash.length >=1 ? FUSION_DONE_MSG : FUSION_SKIPPED_MSG;
                                        break;
                                    default:
                                        outMsg = FUSION_FAILED_MSG;
                                        break;
                                }
                                return outMsg;
                            })
                        );
                    }
                    return resolve(FUSION_SKIPPED_MSG); // fusionReadyCount is 0
                }).catch((err)=>{
                    return reject((err.message));
                });
            });
        }
    }
})();


// misc
function onSectionChanged(what){
    handleWorkerUpdate({
        type: 'sectionChanged',
        data: what
    });
}

// just pass it to ui_updater
function handleWorkerUpdate(msg){
    uiUpdater.updateUiState(msg);
}

module.exports = {
    startService,
    stopService,
    resetGlobals,
    isRunning,
    startWorker,
    stopWorker,
    resetFromHeight,
    getNodeFee,
    getSecretKeys,
    sendTransaction,
    createWallet,
    handleWorkerUpdate,
    onSectionChanged,
    importFromKey,
    importFromSeed,
    genIntegratedAddress,
    fusionTx
};