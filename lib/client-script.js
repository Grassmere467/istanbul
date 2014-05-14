(function() {

    postCoverage = function() {
        console.log('postCoverag');

        var socket = io.connect('http://localhost:__PORT__');
        socket.on('connect', function() {
            console.log('connected');
        });

        socket.emit('message', window.__coverage__);
    }

    setInterval(function(){
        console.log('Posting...');
        postCoverage();
    }, __INTERVAL__);

}).call(this);
