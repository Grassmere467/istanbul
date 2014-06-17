var url = require('url');

exports.init= function(config){

    var http = require('http');
    var connect = require('connect');
    var httpProxy = require('http-proxy');

    var fs = require('fs');
    var path = require('path');
    var appPort = config.realtime.config.appPort;
    var proxyPort = config.realtime.config.proxyPort;
    var resultsPort = config.realtime.config.resultsPort;
    var Instrumenter = require('./instrumenter');
    var resultsStartUrl = '/cmac/results/';

    if (config.verbose) {
        console.log('Running proxy server on port: ' + proxyPort + ' with app on port: ' + appPort);
    }

    connect.createServer(
        function (req, res, next) {
            if (config.verbose) {
                console.log('Proxying...' + req.url);
                console.log('Excluding files: ' + config.realtime.config.exclude);
            }

            var file = url.parse(req.url).pathname;

            console.log('File: ' + file +' URL: ' + req.url);

            if (startsWith(req.url, resultsStartUrl)){
                if (config.verbose) {
                    console.log('Request is for results page: ' + req.url);
                }
                
                req.url = '/' + req.url.substring(resultsStartUrl.length);
                if (config.verbose) {
                    console.log('New URL: ' + req.url);
                }

                resultsProxy.web(req, res);
                return; 

            } else if (req.url === '/coverage.js'){
                if (config.verbose) {
                    console.log('Coverage file...');
                }
                
                var socketScript = fs.readFileSync(path.resolve(__dirname, '../bower_components/socket.io-client/dist/socket.io.js')).toString();
                var clientScript = fs.readFileSync(path.resolve(__dirname, '../lib/client-script.js')).toString();
                clientScript = clientScript.replace('__PORT__', config.realtime.config.clientPort);
                clientScript = clientScript.replace('__INTERVAL__', config.realtime.config.clientPostInterval);
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    'Content-Length': socketScript.length + clientScript.length
                });
                res.write(socketScript); 
                res.write(clientScript); 
                res.end();
                return;
            }
            else if (endsWith(file, '.js') && config.realtime.config.exclude.indexOf(file) < 0){
                if (config.verbose) {
                    console.log('Got ' + file + ' javascript file that needs instrumenting');
                }
                
                var _write = res.write;

                var _writeHead = res.writeHead;
                res.writeHead = function(statusCode, headers) {
                    var _end = res.end;

                    if (statusCode == 304){
                        res.writeHead = _writeHead;
                        res.writeHead(304, {});
                        res.end();
                        return;
                    }
                };

                var allData = '';

                res.end = function(data, encoding) {
                    allData += data;
                
                    if (config.verbose) {
                        console.log('Instrumenting javascript file: ' + file);
                    }
        
                    try{

                        var code = instrumentCode(allData.toString(), 'public/' + file);
                         
                        res.writeHead = _writeHead; 
                        res.writeHead(200, {
                            "Content-Type": "application/json",
                            'Content-Length': code.length,
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            "Pragma": "no-cache",
                            "Expires": 0,
                        });

                        _write.call(res, code);
                    }
                    catch(e){
                        console.error('Error instrumenting: ' + JSON.stringify(e));
                    }
                };

                res.write = function (data) {
                    if (config.verbose) {
                        console.log('Datai length: ' + data.toString().length);
                    }
                    allData += data;            
                }
            }else if (endsWith(file, '.js')){
                if (config.verbose) {
                    console.log('Got a javascript file');
                }
            }else if (endsWith(file, '.png')){
                if (config.verbose) {
                    console.log('Got a image file');
                }
            }else{
                if (config.verbose) {
                    console.log('Unknown request...' + req.url);
                }
                
                var _write = res.write;
                var _end = res.end;

                res.write = function (data) {
                    var string = data.toString().replace("<head>", "<head><script src='/coverage.js'></script>");
                    _write.call(res, string.toString());
                };

                res.end = function(){
                    _end.call(res);
                }
            }
            next();
        },
        function (req, res) {
            if (config.verbose) {
                console.log('Proxy call: '+ req.url);
            }
            proxy.web(req, res);
      }
    ).listen(proxyPort);

    var proxy = httpProxy.createProxyServer({
       target: 'http://localhost:' + appPort
    });

    if (config.verbose) {
        console.log('Will redirect requests from /results to localhost:' + resultsPort);
    }

    var resultsProxy = httpProxy.createProxyServer({
       target: 'http://localhost:' + resultsPort
    });

    // Listen for the `error` event on `proxy`.
    proxy.on('error', function (err, req, res) {
      res.writeHead(500, {
        'Content-Type': 'text/plain'
      });

      res.end('Something went wrong. And we are reporting a custom error message.');
    });

    //
    // Listen for the `proxyRes` event on `proxy`.
    //
    proxy.on('proxyRes', function (res) {
      console.log('RAW Response from the target', JSON.stringify(res.headers, true, 2));
      console.log('RAW Response from the target', JSON.stringify(res.data, true, 2));
    });

    function instrumentCode(code, filename) {
        if (config.verbose) {
            console.log('Type of code: ' + typeof code);
        }
        
        var instrumenter = new Instrumenter('', true);
        filename = path.resolve(filename);
        return instrumenter.instrumentSync(code, filename);
    };

    function endsWith(str, suffix) {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }
    
    function startsWith(str, toFind) {
        return str.indexOf(toFind) === 0;
    }

}
