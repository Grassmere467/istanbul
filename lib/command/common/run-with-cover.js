/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
var Module = require('module'),
    path = require('path'),
    fs = require('fs'),
    nopt = require('nopt'),
    which = require('which'),
    mkdirp = require('mkdirp'),
    existsSync = fs.existsSync || path.existsSync,
    inputError = require('../../util/input-error'),
    matcherFor = require('../../util/file-matcher').matcherFor,
    Instrumenter = require('../../instrumenter'),
    Collector = require('../../collector'),
    formatOption = require('../../util/help-formatter').formatOption,
    hook = require('../../hook'),
    Report = require('../../report'),
    resolve = require('resolve'),
    configuration = require('../../configuration'),
    express = require('express'),
    utils = require('../../object-utils');
    var request = require("request");
    var connect = require('connect');
    var http = require('http');
    var httpProxy = require('http-proxy');
    var coverageVar = '$$cov_' + new Date().getTime() + '$$';
    
    console.log('Testing...' + fs.readFileSync('/usr/local/lib/node_modules/istanbul/lib/client-script.js'));

function usage(arg0, command) {

    console.error('\nUsage: ' + arg0 + ' ' + command + ' [<options>] <executable-js-file-or-command> [-- <arguments-to-jsfile>]\n\nOptions are:\n\n'
        + [
            formatOption('--config <path-to-config>', 'the configuration file to use, defaults to .istanbul.yml'),
            formatOption('--root <path> ', 'the root path to look for files to instrument, defaults to .'),
            formatOption('-x <exclude-pattern> [-x <exclude-pattern>]', 'one or more fileset patterns e.g. "**/vendor/**"'),
            formatOption('--[no-]default-excludes', 'apply default excludes [ **/node_modules/**, **/test/**, **/tests/** ], defaults to true'),
            formatOption('--hook-run-in-context', 'hook vm.runInThisContext in addition to require (supports RequireJS), defaults to false'),
            formatOption('--post-require-hook <file> | <module>', 'JS module that exports a function for post-require processing'),
            formatOption('--report <format> [--report <format>] ', 'report format, defaults to lcov (= lcov.info + HTML)'),
            formatOption('--dir <report-dir>', 'report directory, defaults to ./coverage'),
            formatOption('--print <type>', 'type of report to print to console, one of summary (default), detail, both or none'),
            formatOption('--verbose, -v', 'verbose mode'),
            formatOption('--realtime <duration>', 'realtime mode'),
            formatOption('--[no-]preserve-comments', 'remove / preserve comments in the output, defaults to false')
        ].join('\n\n') + '\n');
    console.error('\n');
}

function run(args, commandName, enableHooks, callback) {
    if (verbose) {
        console.log('Starting... Args: ' + JSON.stringify(args));
        console.log('Coverage Var Name: ' + coverageVar);
    }
    var template = {
            config: path,
            root: path,
            x: [ Array, String ],
            report: [Array, String ],
            dir: path,
            verbose: Boolean,
            yui: Boolean,
            'default-excludes': Boolean,
            print: String,
            'self-test': Boolean,
            'hook-run-in-context': Boolean,
            'post-require-hook': String,
            'preserve-comments': Boolean,
            realtime: String, 
        },
        opts = nopt(template, { v : '--verbose' }, args, 0),
        overrides = {
            verbose: opts.verbose,
            realtime: opts['realtime'],
            instrumentation: {
                root: opts.root,
                'default-excludes': opts['default-excludes'],
                excludes: opts.x
            },
            reporting: {
                reports: opts.report,
                print: opts.print,
                dir: opts.dir
            },
            hooks: {
                'hook-run-in-context': opts['hook-run-in-context'],
                'post-require-hook': opts['post-require-hook']
            }
        },
        config = configuration.loadFile(opts.config, overrides),
        watermarks = config.reporting.watermarks(),
        reportOpts,
        verbose = config.verbose,
        cmdAndArgs = opts.argv.remain,
        preserveComments = opts['preserve-comments'],
        cmd,
        cmdArgs,
        reportingDir,
        reports = [],
        runFn,
        excludes;

    if (cmdAndArgs.length === 0) {
        return callback(inputError.create('Need a filename argument for the ' + commandName + ' command!'));
    }

    if (verbose) {
        console.log('Opts: ' + JSON.stringify(opts));
    }

    cmd = cmdAndArgs.shift();
    cmdArgs = cmdAndArgs;

    if (!existsSync(cmd)) {
        try {
            cmd = which.sync(cmd);
        } catch (ex) {
            return callback(inputError.create('Unable to resolve file [' + cmd + ']'));
        }
    } else {
        cmd = path.resolve(cmd);
    }

    runFn = function () {
        process.argv = ["node", cmd].concat(cmdArgs);
        if (verbose) {
            console.log('Running: ' + process.argv.join(' '));
        }
        process.env.running_under_istanbul=1;
        Module.runMain(cmd, null, true);
    };

    setupListener = function(){
        console.log('Setup listener...');

        var express = require('express');
        var app = express();
        var http = require('http');
        var server = http.createServer(app);
        var io = require('socket.io').listen(server);

        server.listen(8889);

        io.sockets.on('connection', function (socket) { // First connection
            console.log('Connection');
            socket.on('message', function (data) { // Broadcast the message to all
                console.log('Received remote data');
                //console.log('Message: ' + JSON.stringify(data, null, 2));
                cov = global[coverageVar];
                mergeClientCoverage(data, cov); 
            });
        });

        runProxyServer(8888, verbose);

    };

    function mergeClientCoverage(obj, coverage) {
        if (!obj) { return; }
        //var coverage = getCoverageObject();
        Object.keys(obj).forEach(function (filePath) {
            var original = coverage[filePath],
                added = obj[filePath],
                result;
            if (original) {
                result = utils.mergeFileCoverage(original, added);
            } else {
                result = added;
            }
            coverage[filePath] = result;
        });
    }

    excludes = config.instrumentation.excludes(true);

    if (enableHooks) {
        reportingDir = path.resolve(config.reporting.dir());
        reportOpts = { dir: reportingDir, watermarks: watermarks };
        mkdirp.sync(reportingDir); //ensure we fail early if we cannot do this
        reports.push.apply(reports, config.reporting.reports().map(function (r) {
            return Report.create(r, reportOpts);
        }));
        if (config.reporting.print() !== 'none') {
            switch (config.reporting.print()) {
            case 'detail':
                reports.push(Report.create('text', reportOpts));
                break;
            case 'both':
                reports.push(Report.create('text', reportOpts));
                reports.push(Report.create('text-summary', reportOpts));
                break;
            default:
                reports.push(Report.create('text-summary', reportOpts));
                break;
            }
        }

        matcherFor({
            root: config.instrumentation.root() || process.cwd(),
            includes: [ '**/*.js' ],
            excludes: excludes
        },
            function (err, matchFn) {
                if (err) { return callback(err); }

                    var instrumenter = new Instrumenter({ coverageVariable: coverageVar , preserveComments: preserveComments}),
                    transformer = instrumenter.instrumentSync.bind(instrumenter),
                    hookOpts = { verbose: verbose },
                    postRequireHook = config.hooks.postRequireHook(),
                    postLoadHookFile;

                if (postRequireHook) {
                    postLoadHookFile = path.resolve(postRequireHook);
                } else if (opts.yui) { //EXPERIMENTAL code: do not rely on this in anyway until the docs say it is allowed
                    postLoadHookFile = path.resolve(__dirname, '../../util/yui-load-hook');
                }

                if (postRequireHook) {
                    if (!existsSync(postLoadHookFile)) { //assume it is a module name and resolve it
                        try {
                            postLoadHookFile = resolve.sync(postRequireHook, { basedir: process.cwd() });
                        } catch (ex) {
                            if (verbose) { console.error('Unable to resolve [' + postRequireHook + '] as a node module'); }
                        }
                    }
                }
                if (postLoadHookFile) {
                    if (verbose) { console.error('Use post-load-hook: ' + postLoadHookFile); }
                    hookOpts.postLoadHook = require(postLoadHookFile)(matchFn, transformer, verbose);
                }

                if (opts['self-test']) {
                    hook.unloadRequireCache(matchFn);
                }
                // runInThisContext is used by RequireJS [issue #23]
                if (config.hooks.hookRunInContext()) {
                    hook.hookRunInThisContext(matchFn, transformer, hookOpts);
                }
                hook.hookRequire(matchFn, transformer, hookOpts);

                //initialize the global variable to stop mocha from complaining about leaks
                global[coverageVar] = {};

                if (verbose) {
                    console.log('Coverage: ' + coverageVar);
                }
                generateResults = function () {
                    var file = path.resolve(reportingDir, 'coverage.json'),
                        collector,
                        cov;
                    if (typeof global[coverageVar] === 'undefined' || Object.keys(global[coverageVar]).length === 0) {
                        console.error('No coverage information was collected, exit without writing coverage information');
                        return;
                    } else {
                        cov = global[coverageVar];
                    }
                    //important: there is no event loop at this point
                    //everything that happens in this exit handler MUST be synchronous
                    mkdirp.sync(reportingDir); //yes, do this again since some test runners could clean the dir initially created
                    if (config.reporting.print() !== 'none') {
                        console.error('=============================================================================');
                        console.error('Writing coverage object [' + file + ']');
                    }
                    fs.writeFileSync(file, JSON.stringify(cov), 'utf8');
                    collector = new Collector();
                    collector.add(cov);
                    if (config.reporting.print() !== 'none') {
                        console.error('Writing coverage reports at [' + reportingDir + ']');
                        console.error('=============================================================================');
                    }
                    reports.forEach(function (report) {
                        report.writeReport(collector, true);
                    });
                    return callback();
                };

                process.once('exit', function(){
                    generateResults();
                });

                if (opts['realtime']) {
                    console.log('Enabling real time reporting with delay of: ' + opts['realtime']);

                    setInterval(function(){
                        generateResults();
                    }, opts['realtime']); 
                };

                setupListener();
                
                runFn();
            });
    } else {
        runFn();
    }
};

function runProxyServer(port, verbose){
    if (verbose) {
        console.log('Running proxy server');
    }

    connect.createServer(function(req, res, next) {
        if (verbose) {
            console.log('Proxying...' + req.url);
        }

        if (endsWith(req.url, '.js')){
            console.log('Have js file: ' + req.url);
           
            request("http://localhost:8888/" + req.url, function(error, response, body) {
                console.log('Got response');
                code = instrumentCode(body, 'public/' + req.url);
                res.write(code);
                res.end();
            });
        }else if (endsWith(req.url, '/') || (req.url.length === 0)){
            console.log('Root File');
            request("http://localhost:8888/" + req.url, function(error, response, body) {
                console.log('Got HTML response');
                res.write(body);
                
                if (body.indexOf('<head>') > -1){
                    console.log('Html file has header so adding script');
                    var clientScript = fs.readFileSync('/usr/local/lib/node_modules/istanbul/lib/client-script.js').toString();
                    console.log('clietnSCript: ' + clientScript);
                    res.write('<script>' + clientScript + '</script>');
                }else{
                    console.log('Html file doesnt contain header');
                }
                
                res.end();
            });
            
        }else{
            // res.write('Test...');
            console.log('Other Request: ' + req.url);
            proxy.web(req, res);
        }
    }).listen(5050);

    var proxy = httpProxy.createProxyServer({
      target: 'http://localhost:8888'
    });
    
    console.log("listening on port 5050")
};

function instrumentCode(code, filename) {
    instrumenter = new Instrumenter();
    filename = path.resolve(filename);
    return instrumenter.instrumentSync(code, filename);
};

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

module.exports = {
    run: run,
    usage: usage
};
