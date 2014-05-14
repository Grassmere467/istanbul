(function() {
    var coverageObject = __coverage__;

    postCoverage = function() {
    console.log('postCoverag');

    var socket = io.connect('http://10.123.10.143:8889');
        socket.on('connect', function() {
        console.log('connected');
    });

    socket.emit('message', coverageObject);
    }

    setInterval(function(){
        console.log('Posting...');
        postCoverage();
    }, 8000);

}).call(this);
