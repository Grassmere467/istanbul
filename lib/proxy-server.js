exports.init= function(config){

    var http = require('http'),
        connect = require('connect'),
        httpProxy = require('http-proxy');

    var fs = require('fs');
    var path = require('path');
    var appPort = config.realtime.config.appPort;
    var proxyPort = config.realtime.config.proxyPort;
    var Instrumenter = require('./instrumenter');

    if (config.verbose) {
        console.log('Running proxy server on port: ' + proxyPort + ' with app on port: ' + appPort);
    }

    connect.createServer(
        function (req, res, next) {
            if (config.verbose) {
                console.log('Proxying...' + req.url);
                console.log('Excluding files: ' + config.realtime.config.exclude);
            }

            if (req.url === '/coverage.js'){
                console.log('Coverage file...');
                var socketScript = fs.readFileSync(path.resolve(__dirname, '../bower_components/socket.io-client/dist/socket.io.js')).toString();
                var clientScript = fs.readFileSync(path.resolve(__dirname, '../lib/client-script.js')).toString();
                clientScript = clientScript.replace('__PORT__', config.realtime.config.clientPort);
                clientScript = clientScript.replace('__INTERVAL__', config.realtime.config.clientPostInterval);
                res.write(socketScript); 
                res.write(clientScript); 
                res.end();
                return;
            }
            else if (endsWith(req.url, '.js') && config.realtime.config.exclude.indexOf(req.url) < 0){
                console.log('Have js file: ' + req.url);
                var _write = res.write;

               var _writeHead = res.writeHead;
              res.writeHead = function(statusCode, headers) {
                console.log('writeHead: ');
                /* add logic to change headers here */
//                var contentType = res.getHeader('content-type');
  //              res.setHeader('content-type', 'text/plain');

                // old way: might not work now
                // as headers param is not always provided
                // https://github.com/nodejitsu/node-http-proxy/pull/260/files
                // headers['foo'] = 'bar';       

    //            _writeHead(statusCode, headers);
              };

                res.write = function (data) {
                    console.log('Data: ' + data);
                    console.log('Data String: ' + data.toString());

                    var code = instrumentCode(data.toString(), 'public/' + req.url);
                   
                    res.writeHead = _writeHead; 
                    res.writeHead(200, {
                        "Content-Type": "application/json",
                        'Content-Length': code.length
                    });

                    console.log('Code: ' + code);
                    _write.call(res, code);
                }
            }else if (endsWith(req.url, '.png')){
                console.log('Its an image...');
            }else{
                console.log('Unknown request...');
                var _write = res.write;

                res.write = function (data) {
                    var string = data.toString().replace("<head>", "<head><script src='coverage.js'></script>");
                    _write.call(res, string);
                }
            }
            next();
        },
        function (req, res) {
            console.log('Again...' + req.url);
            proxy.web(req, res);
      }
    ).listen(proxyPort);

    var proxy = httpProxy.createProxyServer({
       target: 'http://localhost:' + appPort
    })

    function instrumentCode(code, filename) {
        console.log('Type of code: ' + typeof code);
          instrumenter = new Instrumenter();
        filename = path.resolve(filename);
        return instrumenter.instrumentSync(code, filename);
    };

    function endsWith(str, suffix) {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }

}