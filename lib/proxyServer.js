'use strict';

var http = require('http'),
    https = require('https'),
    net = require('net'),
    os = require('os'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    request = require('request'),
    httpsSocket,
    httpServer,
    httpsServer;

var SOCKET_NAME = 'proxy.socket',
    HOST = 'localhost',
    PORT = 8008;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function init() {
    httpsSocket = path.join(os.tmpdir(), SOCKET_NAME)

    if (fs.existsSync(httpsSocket)) {
        fs.unlinkSync(httpsSocket);
    }

    httpsServer = https.createServer({
        key: fs.readFileSync(path.join(__dirname, '../key.pem'), 'utf8'),
        cert: fs.readFileSync(path.join(__dirname, '../cert.pem'), 'utf8')
    }, requestHandler.bind(this)).listen(httpsSocket);

    // start HTTP server with custom request handler callback function
    httpServer = http.createServer(requestHandler.bind(this)).listen(PORT, HOST, function(err) {
        if (err) {
            throw err;
        }
        console.log('Proxy server started at %s:%s...', HOST, PORT);
    });

    httpServer.on('connect', connectEventHandler);
}

function requestHandler(req, res) {
    var pathname = url.parse(req.url).path,
        protocol = req.client.encrypted ? 'https' : 'http',
        endpoint = url.format({
            protocol: protocol,
            host: req.headers.host,
            pathname: pathname
        }),
        params = {
            url: endpoint,
            rejectUnauthorized: false
        };

    req.pipe(request(params)).pipe(res);
}

function connectEventHandler(req, socketRequest, bodyHead) {
    var url = req.url,
        httpVersion = req.httpVersion,
        proxySocket = new net.Socket();

    console.log('Proxying requested url "%s" through socket "%s"', url, httpsSocket);

    proxySocket.connect(httpsSocket, function() {
        //console.log('< connected to socket "%s"', httpsSocket);
        //console.log('> writing head of length %d', bodyHead ? bodyHead.length : 0);

        proxySocket.write(bodyHead);

        socketRequest.write('HTTP/' + httpVersion + ' 200 Connection established\r\n\r\n');
    });

    proxySocket.on('data', function(chunk) {
        //console.log('< data length = %d', chunk.length);
        socketRequest.write(chunk);
    });

    proxySocket.on('end', function() {
        //console.log('< end');
        socketRequest.end();
    });

    proxySocket.on('error', function(err) {
        socketRequest.write('HTTP/' + httpVersion + ' 500 Connection error\r\n\r\n');
        //console.log('< ERR: %s', err);
        socketRequest.end();
    });

    socketRequest.on('data', function(chunk) {
        //console.log('> data length = %d', chunk.length);
        proxySocket.write(chunk);
    });

    socketRequest.on('end', function() {
        //console.log('> end');
        proxySocket.end();
    });

    socketRequest.on('error', function(err) {
        //console.log('> ERR: %s', err);
        proxySocket.end();
    });

}

init();