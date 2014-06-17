(function() {

    postCoverage = function() {
        console.log('postCoverag');

        var url = "clientResults/";
        var method = "POST";

        var async = true;
        var request = new XMLHttpRequest();
        request.onload = function () {
           var status = request.status; // HTTP response status, e.g., 200 for "200 OK"
           var data = request.responseText; // Returned data, e.g., an HTML document.
        }

        request.open(method, url, async);
        request.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        request.send(JSON.stringify(window.__coverage__, null, 4));
    }

    setInterval(function(){
        console.log('Posting...');
        postCoverage();
    }, __INTERVAL__);

}).call(this);
