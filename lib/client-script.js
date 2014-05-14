(function() {

    postCoverage = function() {
        console.log('postCoverag');

        var socket = io.connect('http://localhost:8889');
        socket.on('connect', function() {
            console.log('connected');
        });

        socket.emit('message', window.__coverage__);
    }

    setInterval(function(){
        console.log('Posting...');
        postCoverage();
    }, 8000);

}).call(this);
