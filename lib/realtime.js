exports.resultsServer = function(config){ 

    var http = require("http"),
        url = require("url"),
        path = require("path"),
        fs = require("fs")
        port = config.realtime.config.resultsPort,
        baseDir = 'coverage/lcov-report';

    console.log('results server starting...on port: ' + port);
    
    http.createServer(function(request, response) {

        var uri = url.parse(request.url).pathname;
        var filename = path.join(process.cwd() + '/' + baseDir + '/', uri);
      
        console.log('Request for file: ' + filename);

        path.exists(filename, function(exists) {
        if(!exists) {
          response.writeHead(404, {"Content-Type": "text/plain"});
          response.write("404 Not Found\n");
          response.end();
          return;
        }

        if (fs.statSync(filename).isDirectory()) {
            filename += '/index.html';
        }

        fs.readFile(filename, "binary", function(err, file) {
          if(err) {        
            response.writeHead(500, {"Content-Type": "text/plain"});
            response.write(err + "\n");
            response.end();
            return;
          }

          response.writeHead(200);
          response.write(file, "binary");
          response.end();
        });
      });
    }).listen(parseInt(port, 10));
}


