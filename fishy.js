//based on kittdar url:harthur.github.com/kittydar/
function compare(a,b) {
    var aName= parseInt(a.name.substring(0, a.name.indexOf('.') ), 10);
    var bName= parseInt(b.name.substring(0, b.name.indexOf('.') ), 10);
    if (aName < bName)
        return -1;
    if (aName > bName)
        return 1;
    return 0;
}


//created by browserfy
var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';

        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';

        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }

        var n = loadNodeModulesSync(x, y);
        if (n) return n;

        throw new Error("Cannot find module '" + x + "'");

        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }

            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }

        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }

            return loadAsFileSync(x + '/index');
        }

        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }

            var m = loadAsFileSync(x);
            if (m) return m;
        }

        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');

            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }

            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);

    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;

    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };

    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
            && window.postMessage && window.addEventListener
        ;

    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }

    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

if (!process.env) process.env = {};
if (!process.argv) process.argv = [];

require.define("path", function (require, module, exports, __dirname, __filename) {
    function filter (xs, fn) {
        var res = [];
        for (var i = 0; i < xs.length; i++) {
            if (fn(xs[i], i, xs)) res.push(xs[i]);
        }
        return res;
    }

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
    function normalizeArray(parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length; i >= 0; i--) {
            var last = parts[i];
            if (last == '.') {
                parts.splice(i, 1);
            } else if (last === '..') {
                parts.splice(i, 1);
                up++;
            } else if (up) {
                parts.splice(i, 1);
                up--;
            }
        }

        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
            for (; up--; up) {
                parts.unshift('..');
            }
        }

        return parts;
    }

// Regex to split a filename into [*, dir, basename, ext]
// posix version
    var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
    exports.resolve = function() {
        var resolvedPath = '',
            resolvedAbsolute = false;

        for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
            var path = (i >= 0)
                ? arguments[i]
                : process.cwd();

            // Skip empty and invalid entries
            if (typeof path !== 'string' || !path) {
                continue;
            }

            resolvedPath = path + '/' + resolvedPath;
            resolvedAbsolute = path.charAt(0) === '/';
        }

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
        resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
            return !!p;
        }), !resolvedAbsolute).join('/');

        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
    };

// path.normalize(path)
// posix version
    exports.normalize = function(path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.slice(-1) === '/';

// Normalize the path
        path = normalizeArray(filter(path.split('/'), function(p) {
            return !!p;
        }), !isAbsolute).join('/');

        if (!path && !isAbsolute) {
            path = '.';
        }
        if (path && trailingSlash) {
            path += '/';
        }

        return (isAbsolute ? '/' : '') + path;
    };


// posix version
    exports.join = function() {
        var paths = Array.prototype.slice.call(arguments, 0);
        return exports.normalize(filter(paths, function(p, index) {
            return p && typeof p === 'string';
        }).join('/'));
    };


    exports.dirname = function(path) {
        var dir = splitPathRe.exec(path)[1] || '';
        var isWindows = false;
        if (!dir) {
            // No dirname
            return '.';
        } else if (dir.length === 1 ||
            (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
            // It is just a slash or a drive letter with a slash
            return dir;
        } else {
            // It is a full dirname, strip trailing slash
            return dir.substring(0, dir.length - 1);
        }
    };


    exports.basename = function(path, ext) {
        var f = splitPathRe.exec(path)[2] || '';
        // TODO: make this comparison case-insensitive on windows?
        if (ext && f.substr(-1 * ext.length) === ext) {
            f = f.substr(0, f.length - ext.length);
        }
        return f;
    };


    exports.extname = function(path) {
        return splitPathRe.exec(path)[3] || '';
    };

});

require.define("/node_modules/brain/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"./lib/brain"}
});

require.define("/node_modules/brain/lib/brain.js", function (require, module, exports, __dirname, __filename) {
    exports.NeuralNetwork = require("./neuralnetwork").NeuralNetwork;
    exports.crossValidate = require("./cross-validate");

});

require.define("/node_modules/brain/lib/neuralnetwork.js", function (require, module, exports, __dirname, __filename) {
    var _ = require("underscore"),
        lookup = require("./lookup");

    var NeuralNetwork = function(options) {
        options = options || {};
        this.learningRate = options.learningRate || 0.3;
        this.momentum = options.momentum || 0.1;
        this.hiddenSizes = options.hiddenLayers;
    }

    NeuralNetwork.prototype = {
        initialize: function(sizes) {
            this.sizes = sizes;
            this.outputLayer = this.sizes.length - 1;

            this.biases = []; // weights for bias nodes
            this.weights = [];
            this.outputs = [];

            // state for training
            this.deltas = [];
            this.changes = []; // for momentum
            this.errors = [];

            for (var layer = 0; layer <= this.outputLayer; layer++) {
                var size = this.sizes[layer];
                this.deltas[layer] = zeros(size);
                this.errors[layer] = zeros(size);
                this.outputs[layer] = zeros(size);

                if (layer > 0) {
                    this.biases[layer] = randos(size);
                    this.weights[layer] = new Array(size);
                    this.changes[layer] = new Array(size);

                    for (var node = 0; node < size; node++) {
                        var prevSize = this.sizes[layer - 1];
                        this.weights[layer][node] = randos(prevSize);
                        this.changes[layer][node] = zeros(prevSize);
                    }
                }
            }
        },

        run: function(input) {
            if (this.inputLookup) {
                input = lookup.toArray(this.inputLookup, input);
            }

            var output = this.runInput(input);

            if (this.outputLookup) {
                output = lookup.toHash(this.outputLookup, output);
            }
            return output;
        },

        runInput: function(input) {
            this.outputs[0] = input;  // set output state of input layer

            for (var layer = 1; layer <= this.outputLayer; layer++) {
                for (var node = 0; node < this.sizes[layer]; node++) {
                    var weights = this.weights[layer][node];

                    var sum = this.biases[layer][node];
                    for (var k = 0; k < weights.length; k++) {
                        sum += weights[k] * input[k];
                    }
                    this.outputs[layer][node] = 1 / (1 + Math.exp(-sum));
                }
                var output = input = this.outputs[layer];
            }
            return output;
        },

        train: function(data, options) {
            data = this.formatData(data);

            options = options || {};
            var iterations = options.iterations || 20000;
            var errorThresh = options.errorThresh || 0.005;
            var log = options.log || false;
            var logPeriod = options.logPeriod || 10;
            var callback = options.callback;
            var callbackPeriod = options.callbackPeriod || 10;

            var inputSize = data[0].input.length;
            var outputSize = data[0].output.length;

            var hiddenSizes = this.hiddenSizes;
            if (!hiddenSizes) {
                hiddenSizes = [Math.max(3, Math.floor(inputSize / 2))];
            }
            var sizes = _([inputSize, hiddenSizes, outputSize]).flatten();
            this.initialize(sizes);

            var error = 1;
            for (var i = 0; i < iterations && error > errorThresh; i++) {
                var sum = 0;
                for (var j = 0; j < data.length; j++) {
                    var err = this.trainPattern(data[j].input, data[j].output);
                    sum += err;
                }
                error = sum / data.length;

                if (log && (i % logPeriod == 0)) {
                    console.log("iterations:", i, "training error:", error);
                }
                if (callback && (i % callbackPeriod == 0)) {
                    callback({ error: error, iterations: i });
                }
            }

            return {
                error: error,
                iterations: i
            };
        },

        trainPattern : function(input, target) {
            // forward propogate
            this.runInput(input);

            // back propogate
            this.calculateDeltas(target);
            this.adjustWeights();

            var error = mse(this.errors[this.outputLayer]);
            return error;
        },

        calculateDeltas: function(target) {
            for (var layer = this.outputLayer; layer >= 0; layer--) {
                for (var node = 0; node < this.sizes[layer]; node++) {
                    var output = this.outputs[layer][node];

                    var error = 0;
                    if (layer == this.outputLayer) {
                        error = target[node] - output;
                    }
                    else {
                        var deltas = this.deltas[layer + 1];
                        for (var k = 0; k < deltas.length; k++) {
                            error += deltas[k] * this.weights[layer + 1][k][node];
                        }
                    }
                    this.errors[layer][node] = error;
                    this.deltas[layer][node] = error * output * (1 - output);
                }
            }
        },

        adjustWeights: function() {
            for (var layer = 1; layer <= this.outputLayer; layer++) {
                var incoming = this.outputs[layer - 1];

                for (var node = 0; node < this.sizes[layer]; node++) {
                    var delta = this.deltas[layer][node];

                    for (var k = 0; k < incoming.length; k++) {
                        var change = this.changes[layer][node][k];

                        change = (this.learningRate * delta * incoming[k])
                            + (this.momentum * change);

                        this.changes[layer][node][k] = change;
                        this.weights[layer][node][k] += change;
                    }
                    this.biases[layer][node] += this.learningRate * delta;
                }
            }
        },

        formatData: function(data) {
            // turn sparse hash input into arrays with 0s as filler
            if (!_(data[0].input).isArray()) {
                if (!this.inputLookup) {
                    this.inputLookup = lookup.buildLookup(_(data).pluck("input"));
                }
                data = data.map(function(datum) {
                    var array = lookup.toArray(this.inputLookup, datum.input)
                    return _(_(datum).clone()).extend({ input: array });
                }, this);
            }

            if (!_(data[0].output).isArray()) {
                if (!this.outputLookup) {
                    this.outputLookup = lookup.buildLookup(_(data).pluck("output"));
                }
                data = data.map(function(datum) {
                    var array = lookup.toArray(this.outputLookup, datum.output);
                    return _(_(datum).clone()).extend({ output: array });
                }, this);
            }
            return data;
        },

        test : function(data, binaryThresh) {
            data = this.formatData(data);
            binaryThresh = binaryThresh || 0.5;

            // for binary classification problems with one output node
            var isBinary = data[0].output.length == 1;
            var falsePos = 0,
                falseNeg = 0,
                truePos = 0,
                trueNeg = 0;

            // for classification problems
            var misclasses = [];

            // run each pattern through the trained network and collect
            // error and misclassification statistics
            var sum = 0;
            for (var i = 0; i < data.length; i++) {
                var output = this.runInput(data[i].input);
                var target = data[i].output;

                var actual, expected;
                if (isBinary) {
                    actual = output[0] > binaryThresh ? 1 : 0;
                    expected = target[0];
                }
                else {
                    actual = output.indexOf(_(output).max());
                    expected = target.indexOf(_(target).max());
                }

                if (actual != expected) {
                    var misclass = data[i];
                    _(misclass).extend({
                        actual: actual,
                        expected: expected
                    })
                    misclasses.push(misclass);
                }

                if (isBinary) {
                    if (actual == 0 && expected == 0) {
                        trueNeg++;
                    }
                    else if (actual == 1 && expected == 1) {
                        truePos++;
                    }
                    else if (actual == 0 && expected == 1) {
                        falseNeg++;
                    }
                    else if (actual == 1 && expected == 0) {
                        falsePos++;
                    }
                }

                var errors = output.map(function(value, i) {
                    return target[i] - value;
                });
                sum += mse(errors);
            }
            var error = sum / data.length;

            var stats = {
                error: error,
                misclasses: misclasses
            };

            if (isBinary) {
                _(stats).extend({
                    trueNeg: trueNeg,
                    truePos: truePos,
                    falseNeg: falseNeg,
                    falsePos: falsePos,
                    total: data.length,
                    precision: truePos / (truePos + falsePos),
                    recall: truePos / (truePos + falseNeg),
                    accuracy: (trueNeg + truePos) / data.length
                })
            }
            return stats;
        },

        toJSON: function() {
            /* make json look like:
             {
             layers: [
             { x: {},
             y: {}},
             {'0': {bias: -0.98771313, weights: {x: 0.8374838, y: 1.245858},
             '1': {bias: 3.48192004, weights: {x: 1.7825821, y: -2.67899}}},
             { f: {bias: 0.27205739, weights: {'0': 1.3161821, '1': 2.00436}}}
             ]
             }
             */
            var layers = [];
            for (var layer = 0; layer <= this.outputLayer; layer++) {
                layers[layer] = {};

                var nodes;
                // turn any internal arrays back into hashes for readable json
                if (layer == 0 && this.inputLookup) {
                    nodes = _(this.inputLookup).keys();
                }
                else if (layer == this.outputLayer && this.outputLookup) {
                    nodes = _(this.outputLookup).keys();
                }
                else {
                    nodes = _.range(0, this.sizes[layer]);
                }

                for (var j = 0; j < nodes.length; j++) {
                    var node = nodes[j];
                    layers[layer][node] = {};

                    if (layer > 0) {
                        layers[layer][node].bias = this.biases[layer][j];
                        layers[layer][node].weights = {};
                        for (var k in layers[layer - 1]) {
                            var index = k;
                            if (layer == 1 && this.inputLookup) {
                                index = this.inputLookup[k];
                            }
                            layers[layer][node].weights[k] = this.weights[layer][j][index];
                        }
                    }
                }
            }
            return { layers: layers };
        },

        fromJSON: function(json) {
            var size = json.layers.length;
            this.outputLayer = size - 1;

            this.sizes = new Array(size);
            this.weights = new Array(size);
            this.biases = new Array(size);
            this.outputs = new Array(size);

            for (var i = 0; i <= this.outputLayer; i++) {
                var layer = json.layers[i];
                if (i == 0 && !layer[0]) {
                    this.inputLookup = lookup.lookupFromHash(layer);
                }
                else if (i == this.outputLayer && !layer[0]) {
                    this.outputLookup = lookup.lookupFromHash(layer);
                }

                var nodes = _(layer).keys();
                this.sizes[i] = nodes.length;
                this.weights[i] = [];
                this.biases[i] = [];
                this.outputs[i] = [];

                for (var j in nodes) {
                    var node = nodes[j];
                    this.biases[i][j] = layer[node].bias;
                    this.weights[i][j] = _(layer[node].weights).toArray();
                }
            }
            return this;
        },

        toFunction: function() {
            var json = this.toJSON();
            // return standalone function that mimics run()
            return new Function("input",
                '  var net = ' + JSON.stringify(json) + ';\n\n\
  for (var i = 1; i < net.layers.length; i++) {\n\
    var layer = net.layers[i];\n\
    var output = {};\n\
    \n\
    for (var id in layer) {\n\
      var node = layer[id];\n\
      var sum = node.bias;\n\
      \n\
      for (var iid in node.weights) {\n\
        sum += node.weights[iid] * input[iid];\n\
      }\n\
      output[id] = (1 / (1 + Math.exp(-sum)));\n\
    }\n\
    input = output;\n\
  }\n\
  return output;');
        }
    }

    function randomWeight() {
        return Math.random() * 0.4 - 0.2;
    }

    function zeros(size) {
        var array = new Array(size);
        for (var i = 0; i < size; i++) {
            array[i] = 0;
        }
        return array;
    }

    function randos(size) {
        var array = new Array(size);
        for (var i = 0; i < size; i++) {
            array[i] = randomWeight();
        }
        return array;
    }

    function mse(errors) {
        // mean squared error
        var sum = 0;
        for (var i = 0; i < errors.length; i++) {
            sum += Math.pow(errors[i], 2);
        }
        return sum / errors.length;
    }

    exports.NeuralNetwork = NeuralNetwork;

});

require.define("/node_modules/brain/node_modules/underscore/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/brain/node_modules/underscore/underscore.js", function (require, module, exports, __dirname, __filename) {
//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

    (function() {

        // Baseline setup
        // --------------

        // Establish the root object, `window` in the browser, or `global` on the server.
        var root = this;

        // Save the previous value of the `_` variable.
        var previousUnderscore = root._;

        // Establish the object that gets returned to break out of a loop iteration.
        var breaker = {};

        // Save bytes in the minified (but not gzipped) version:
        var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

        // Create quick reference variables for speed access to core prototypes.
        var slice            = ArrayProto.slice,
            unshift          = ArrayProto.unshift,
            toString         = ObjProto.toString,
            hasOwnProperty   = ObjProto.hasOwnProperty;

        // All **ECMAScript 5** native function implementations that we hope to use
        // are declared here.
        var
            nativeForEach      = ArrayProto.forEach,
            nativeMap          = ArrayProto.map,
            nativeReduce       = ArrayProto.reduce,
            nativeReduceRight  = ArrayProto.reduceRight,
            nativeFilter       = ArrayProto.filter,
            nativeEvery        = ArrayProto.every,
            nativeSome         = ArrayProto.some,
            nativeIndexOf      = ArrayProto.indexOf,
            nativeLastIndexOf  = ArrayProto.lastIndexOf,
            nativeIsArray      = Array.isArray,
            nativeKeys         = Object.keys,
            nativeBind         = FuncProto.bind;

        // Create a safe reference to the Underscore object for use below.
        var _ = function(obj) { return new wrapper(obj); };

        // Export the Underscore object for **Node.js**, with
        // backwards-compatibility for the old `require()` API. If we're in
        // the browser, add `_` as a global object via a string identifier,
        // for Closure Compiler "advanced" mode.
        if (typeof exports !== 'undefined') {
            if (typeof module !== 'undefined' && module.exports) {
                exports = module.exports = _;
            }
            exports._ = _;
        } else {
            root['_'] = _;
        }

        // Current version.
        _.VERSION = '1.3.3';

        // Collection Functions
        // --------------------

        // The cornerstone, an `each` implementation, aka `forEach`.
        // Handles objects with the built-in `forEach`, arrays, and raw objects.
        // Delegates to **ECMAScript 5**'s native `forEach` if available.
        var each = _.each = _.forEach = function(obj, iterator, context) {
            if (obj == null) return;
            if (nativeForEach && obj.forEach === nativeForEach) {
                obj.forEach(iterator, context);
            } else if (obj.length === +obj.length) {
                for (var i = 0, l = obj.length; i < l; i++) {
                    if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
                }
            } else {
                for (var key in obj) {
                    if (_.has(obj, key)) {
                        if (iterator.call(context, obj[key], key, obj) === breaker) return;
                    }
                }
            }
        };

        // Return the results of applying the iterator to each element.
        // Delegates to **ECMAScript 5**'s native `map` if available.
        _.map = _.collect = function(obj, iterator, context) {
            var results = [];
            if (obj == null) return results;
            if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
            each(obj, function(value, index, list) {
                results[results.length] = iterator.call(context, value, index, list);
            });
            if (obj.length === +obj.length) results.length = obj.length;
            return results;
        };

        // **Reduce** builds up a single result from a list of values, aka `inject`,
        // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
        _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
            var initial = arguments.length > 2;
            if (obj == null) obj = [];
            if (nativeReduce && obj.reduce === nativeReduce) {
                if (context) iterator = _.bind(iterator, context);
                return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
            }
            each(obj, function(value, index, list) {
                if (!initial) {
                    memo = value;
                    initial = true;
                } else {
                    memo = iterator.call(context, memo, value, index, list);
                }
            });
            if (!initial) throw new TypeError('Reduce of empty array with no initial value');
            return memo;
        };

        // The right-associative version of reduce, also known as `foldr`.
        // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
        _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
            var initial = arguments.length > 2;
            if (obj == null) obj = [];
            if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
                if (context) iterator = _.bind(iterator, context);
                return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
            }
            var reversed = _.toArray(obj).reverse();
            if (context && !initial) iterator = _.bind(iterator, context);
            return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
        };

        // Return the first value which passes a truth test. Aliased as `detect`.
        _.find = _.detect = function(obj, iterator, context) {
            var result;
            any(obj, function(value, index, list) {
                if (iterator.call(context, value, index, list)) {
                    result = value;
                    return true;
                }
            });
            return result;
        };

        // Return all the elements that pass a truth test.
        // Delegates to **ECMAScript 5**'s native `filter` if available.
        // Aliased as `select`.
        _.filter = _.select = function(obj, iterator, context) {
            var results = [];
            if (obj == null) return results;
            if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
            each(obj, function(value, index, list) {
                if (iterator.call(context, value, index, list)) results[results.length] = value;
            });
            return results;
        };

        // Return all the elements for which a truth test fails.
        _.reject = function(obj, iterator, context) {
            var results = [];
            if (obj == null) return results;
            each(obj, function(value, index, list) {
                if (!iterator.call(context, value, index, list)) results[results.length] = value;
            });
            return results;
        };

        // Determine whether all of the elements match a truth test.
        // Delegates to **ECMAScript 5**'s native `every` if available.
        // Aliased as `all`.
        _.every = _.all = function(obj, iterator, context) {
            var result = true;
            if (obj == null) return result;
            if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
            each(obj, function(value, index, list) {
                if (!(result = result && iterator.call(context, value, index, list))) return breaker;
            });
            return !!result;
        };

        // Determine if at least one element in the object matches a truth test.
        // Delegates to **ECMAScript 5**'s native `some` if available.
        // Aliased as `any`.
        var any = _.some = _.any = function(obj, iterator, context) {
            iterator || (iterator = _.identity);
            var result = false;
            if (obj == null) return result;
            if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
            each(obj, function(value, index, list) {
                if (result || (result = iterator.call(context, value, index, list))) return breaker;
            });
            return !!result;
        };

        // Determine if a given value is included in the array or object using `===`.
        // Aliased as `contains`.
        _.include = _.contains = function(obj, target) {
            var found = false;
            if (obj == null) return found;
            if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
            found = any(obj, function(value) {
                return value === target;
            });
            return found;
        };

        // Invoke a method (with arguments) on every item in a collection.
        _.invoke = function(obj, method) {
            var args = slice.call(arguments, 2);
            return _.map(obj, function(value) {
                return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
            });
        };

        // Convenience version of a common use case of `map`: fetching a property.
        _.pluck = function(obj, key) {
            return _.map(obj, function(value){ return value[key]; });
        };

        // Return the maximum element or (element-based computation).
        _.max = function(obj, iterator, context) {
            if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
            if (!iterator && _.isEmpty(obj)) return -Infinity;
            var result = {computed : -Infinity};
            each(obj, function(value, index, list) {
                var computed = iterator ? iterator.call(context, value, index, list) : value;
                computed >= result.computed && (result = {value : value, computed : computed});
            });
            return result.value;
        };

        // Return the minimum element (or element-based computation).
        _.min = function(obj, iterator, context) {
            if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
            if (!iterator && _.isEmpty(obj)) return Infinity;
            var result = {computed : Infinity};
            each(obj, function(value, index, list) {
                var computed = iterator ? iterator.call(context, value, index, list) : value;
                computed < result.computed && (result = {value : value, computed : computed});
            });
            return result.value;
        };

        // Shuffle an array.
        _.shuffle = function(obj) {
            var shuffled = [], rand;
            each(obj, function(value, index, list) {
                rand = Math.floor(Math.random() * (index + 1));
                shuffled[index] = shuffled[rand];
                shuffled[rand] = value;
            });
            return shuffled;
        };

        // Sort the object's values by a criterion produced by an iterator.
        _.sortBy = function(obj, val, context) {
            var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
            return _.pluck(_.map(obj, function(value, index, list) {
                return {
                    value : value,
                    criteria : iterator.call(context, value, index, list)
                };
            }).sort(function(left, right) {
                    var a = left.criteria, b = right.criteria;
                    if (a === void 0) return 1;
                    if (b === void 0) return -1;
                    return a < b ? -1 : a > b ? 1 : 0;
                }), 'value');
        };

        // Groups the object's values by a criterion. Pass either a string attribute
        // to group by, or a function that returns the criterion.
        _.groupBy = function(obj, val) {
            var result = {};
            var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
            each(obj, function(value, index) {
                var key = iterator(value, index);
                (result[key] || (result[key] = [])).push(value);
            });
            return result;
        };

        // Use a comparator function to figure out at what index an object should
        // be inserted so as to maintain order. Uses binary search.
        _.sortedIndex = function(array, obj, iterator) {
            iterator || (iterator = _.identity);
            var low = 0, high = array.length;
            while (low < high) {
                var mid = (low + high) >> 1;
                iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
            }
            return low;
        };

        // Safely convert anything iterable into a real, live array.
        _.toArray = function(obj) {
            if (!obj)                                     return [];
            if (_.isArray(obj))                           return slice.call(obj);
            if (_.isArguments(obj))                       return slice.call(obj);
            if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
            return _.values(obj);
        };

        // Return the number of elements in an object.
        _.size = function(obj) {
            return _.isArray(obj) ? obj.length : _.keys(obj).length;
        };

        // Array Functions
        // ---------------

        // Get the first element of an array. Passing **n** will return the first N
        // values in the array. Aliased as `head` and `take`. The **guard** check
        // allows it to work with `_.map`.
        _.first = _.head = _.take = function(array, n, guard) {
            return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
        };

        // Returns everything but the last entry of the array. Especcialy useful on
        // the arguments object. Passing **n** will return all the values in
        // the array, excluding the last N. The **guard** check allows it to work with
        // `_.map`.
        _.initial = function(array, n, guard) {
            return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
        };

        // Get the last element of an array. Passing **n** will return the last N
        // values in the array. The **guard** check allows it to work with `_.map`.
        _.last = function(array, n, guard) {
            if ((n != null) && !guard) {
                return slice.call(array, Math.max(array.length - n, 0));
            } else {
                return array[array.length - 1];
            }
        };

        // Returns everything but the first entry of the array. Aliased as `tail`.
        // Especially useful on the arguments object. Passing an **index** will return
        // the rest of the values in the array from that index onward. The **guard**
        // check allows it to work with `_.map`.
        _.rest = _.tail = function(array, index, guard) {
            return slice.call(array, (index == null) || guard ? 1 : index);
        };

        // Trim out all falsy values from an array.
        _.compact = function(array) {
            return _.filter(array, function(value){ return !!value; });
        };

        // Return a completely flattened version of an array.
        _.flatten = function(array, shallow) {
            return _.reduce(array, function(memo, value) {
                if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
                memo[memo.length] = value;
                return memo;
            }, []);
        };

        // Return a version of the array that does not contain the specified value(s).
        _.without = function(array) {
            return _.difference(array, slice.call(arguments, 1));
        };

        // Produce a duplicate-free version of the array. If the array has already
        // been sorted, you have the option of using a faster algorithm.
        // Aliased as `unique`.
        _.uniq = _.unique = function(array, isSorted, iterator) {
            var initial = iterator ? _.map(array, iterator) : array;
            var results = [];
            // The `isSorted` flag is irrelevant if the array only contains two elements.
            if (array.length < 3) isSorted = true;
            _.reduce(initial, function (memo, value, index) {
                if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
                    memo.push(value);
                    results.push(array[index]);
                }
                return memo;
            }, []);
            return results;
        };

        // Produce an array that contains the union: each distinct element from all of
        // the passed-in arrays.
        _.union = function() {
            return _.uniq(_.flatten(arguments, true));
        };

        // Produce an array that contains every item shared between all the
        // passed-in arrays. (Aliased as "intersect" for back-compat.)
        _.intersection = _.intersect = function(array) {
            var rest = slice.call(arguments, 1);
            return _.filter(_.uniq(array), function(item) {
                return _.every(rest, function(other) {
                    return _.indexOf(other, item) >= 0;
                });
            });
        };

        // Take the difference between one array and a number of other arrays.
        // Only the elements present in just the first array will remain.
        _.difference = function(array) {
            var rest = _.flatten(slice.call(arguments, 1), true);
            return _.filter(array, function(value){ return !_.include(rest, value); });
        };

        // Zip together multiple lists into a single array -- elements that share
        // an index go together.
        _.zip = function() {
            var args = slice.call(arguments);
            var length = _.max(_.pluck(args, 'length'));
            var results = new Array(length);
            for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
            return results;
        };

        // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
        // we need this function. Return the position of the first occurrence of an
        // item in an array, or -1 if the item is not included in the array.
        // Delegates to **ECMAScript 5**'s native `indexOf` if available.
        // If the array is large and already in sort order, pass `true`
        // for **isSorted** to use binary search.
        _.indexOf = function(array, item, isSorted) {
            if (array == null) return -1;
            var i, l;
            if (isSorted) {
                i = _.sortedIndex(array, item);
                return array[i] === item ? i : -1;
            }
            if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
            for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
            return -1;
        };

        // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
        _.lastIndexOf = function(array, item) {
            if (array == null) return -1;
            if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
            var i = array.length;
            while (i--) if (i in array && array[i] === item) return i;
            return -1;
        };

        // Generate an integer Array containing an arithmetic progression. A port of
        // the native Python `range()` function. See
        // [the Python documentation](http://docs.python.org/library/functions.html#range).
        _.range = function(start, stop, step) {
            if (arguments.length <= 1) {
                stop = start || 0;
                start = 0;
            }
            step = arguments[2] || 1;

            var len = Math.max(Math.ceil((stop - start) / step), 0);
            var idx = 0;
            var range = new Array(len);

            while(idx < len) {
                range[idx++] = start;
                start += step;
            }

            return range;
        };

        // Function (ahem) Functions
        // ------------------

        // Reusable constructor function for prototype setting.
        var ctor = function(){};

        // Create a function bound to a given object (assigning `this`, and arguments,
        // optionally). Binding with arguments is also known as `curry`.
        // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
        // We check for `func.bind` first, to fail fast when `func` is undefined.
        _.bind = function bind(func, context) {
            var bound, args;
            if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
            if (!_.isFunction(func)) throw new TypeError;
            args = slice.call(arguments, 2);
            return bound = function() {
                if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
                ctor.prototype = func.prototype;
                var self = new ctor;
                var result = func.apply(self, args.concat(slice.call(arguments)));
                if (Object(result) === result) return result;
                return self;
            };
        };

        // Bind all of an object's methods to that object. Useful for ensuring that
        // all callbacks defined on an object belong to it.
        _.bindAll = function(obj) {
            var funcs = slice.call(arguments, 1);
            if (funcs.length == 0) funcs = _.functions(obj);
            each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
            return obj;
        };

        // Memoize an expensive function by storing its results.
        _.memoize = function(func, hasher) {
            var memo = {};
            hasher || (hasher = _.identity);
            return function() {
                var key = hasher.apply(this, arguments);
                return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
            };
        };

        // Delays a function for the given number of milliseconds, and then calls
        // it with the arguments supplied.
        _.delay = function(func, wait) {
            var args = slice.call(arguments, 2);
            return setTimeout(function(){ return func.apply(null, args); }, wait);
        };

        // Defers a function, scheduling it to run after the current call stack has
        // cleared.
        _.defer = function(func) {
            return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
        };

        // Returns a function, that, when invoked, will only be triggered at most once
        // during a given window of time.
        _.throttle = function(func, wait) {
            var context, args, timeout, throttling, more, result;
            var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
            return function() {
                context = this; args = arguments;
                var later = function() {
                    timeout = null;
                    if (more) func.apply(context, args);
                    whenDone();
                };
                if (!timeout) timeout = setTimeout(later, wait);
                if (throttling) {
                    more = true;
                } else {
                    result = func.apply(context, args);
                }
                whenDone();
                throttling = true;
                return result;
            };
        };

        // Returns a function, that, as long as it continues to be invoked, will not
        // be triggered. The function will be called after it stops being called for
        // N milliseconds. If `immediate` is passed, trigger the function on the
        // leading edge, instead of the trailing.
        _.debounce = function(func, wait, immediate) {
            var timeout;
            return function() {
                var context = this, args = arguments;
                var later = function() {
                    timeout = null;
                    if (!immediate) func.apply(context, args);
                };
                if (immediate && !timeout) func.apply(context, args);
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        };

        // Returns a function that will be executed at most one time, no matter how
        // often you call it. Useful for lazy initialization.
        _.once = function(func) {
            var ran = false, memo;
            return function() {
                if (ran) return memo;
                ran = true;
                return memo = func.apply(this, arguments);
            };
        };

        // Returns the first function passed as an argument to the second,
        // allowing you to adjust arguments, run code before and after, and
        // conditionally execute the original function.
        _.wrap = function(func, wrapper) {
            return function() {
                var args = [func].concat(slice.call(arguments, 0));
                return wrapper.apply(this, args);
            };
        };

        // Returns a function that is the composition of a list of functions, each
        // consuming the return value of the function that follows.
        _.compose = function() {
            var funcs = arguments;
            return function() {
                var args = arguments;
                for (var i = funcs.length - 1; i >= 0; i--) {
                    args = [funcs[i].apply(this, args)];
                }
                return args[0];
            };
        };

        // Returns a function that will only be executed after being called N times.
        _.after = function(times, func) {
            if (times <= 0) return func();
            return function() {
                if (--times < 1) { return func.apply(this, arguments); }
            };
        };

        // Object Functions
        // ----------------

        // Retrieve the names of an object's properties.
        // Delegates to **ECMAScript 5**'s native `Object.keys`
        _.keys = nativeKeys || function(obj) {
            if (obj !== Object(obj)) throw new TypeError('Invalid object');
            var keys = [];
            for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
            return keys;
        };

        // Retrieve the values of an object's properties.
        _.values = function(obj) {
            return _.map(obj, _.identity);
        };

        // Return a sorted list of the function names available on the object.
        // Aliased as `methods`
        _.functions = _.methods = function(obj) {
            var names = [];
            for (var key in obj) {
                if (_.isFunction(obj[key])) names.push(key);
            }
            return names.sort();
        };

        // Extend a given object with all the properties in passed-in object(s).
        _.extend = function(obj) {
            each(slice.call(arguments, 1), function(source) {
                for (var prop in source) {
                    obj[prop] = source[prop];
                }
            });
            return obj;
        };

        // Return a copy of the object only containing the whitelisted properties.
        _.pick = function(obj) {
            var result = {};
            each(_.flatten(slice.call(arguments, 1)), function(key) {
                if (key in obj) result[key] = obj[key];
            });
            return result;
        };

        // Fill in a given object with default properties.
        _.defaults = function(obj) {
            each(slice.call(arguments, 1), function(source) {
                for (var prop in source) {
                    if (obj[prop] == null) obj[prop] = source[prop];
                }
            });
            return obj;
        };

        // Create a (shallow-cloned) duplicate of an object.
        _.clone = function(obj) {
            if (!_.isObject(obj)) return obj;
            return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
        };

        // Invokes interceptor with the obj, and then returns obj.
        // The primary purpose of this method is to "tap into" a method chain, in
        // order to perform operations on intermediate results within the chain.
        _.tap = function(obj, interceptor) {
            interceptor(obj);
            return obj;
        };

        // Internal recursive comparison function.
        function eq(a, b, stack) {
            // Identical objects are equal. `0 === -0`, but they aren't identical.
            // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
            if (a === b) return a !== 0 || 1 / a == 1 / b;
            // A strict comparison is necessary because `null == undefined`.
            if (a == null || b == null) return a === b;
            // Unwrap any wrapped objects.
            if (a._chain) a = a._wrapped;
            if (b._chain) b = b._wrapped;
            // Invoke a custom `isEqual` method if one is provided.
            if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
            if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
            // Compare `[[Class]]` names.
            var className = toString.call(a);
            if (className != toString.call(b)) return false;
            switch (className) {
                // Strings, numbers, dates, and booleans are compared by value.
                case '[object String]':
                    // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
                    // equivalent to `new String("5")`.
                    return a == String(b);
                case '[object Number]':
                    // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
                    // other numeric values.
                    return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
                case '[object Date]':
                case '[object Boolean]':
                    // Coerce dates and booleans to numeric primitive values. Dates are compared by their
                    // millisecond representations. Note that invalid dates with millisecond representations
                    // of `NaN` are not equivalent.
                    return +a == +b;
                // RegExps are compared by their source patterns and flags.
                case '[object RegExp]':
                    return a.source == b.source &&
                        a.global == b.global &&
                        a.multiline == b.multiline &&
                        a.ignoreCase == b.ignoreCase;
            }
            if (typeof a != 'object' || typeof b != 'object') return false;
            // Assume equality for cyclic structures. The algorithm for detecting cyclic
            // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
            var length = stack.length;
            while (length--) {
                // Linear search. Performance is inversely proportional to the number of
                // unique nested structures.
                if (stack[length] == a) return true;
            }
            // Add the first object to the stack of traversed objects.
            stack.push(a);
            var size = 0, result = true;
            // Recursively compare objects and arrays.
            if (className == '[object Array]') {
                // Compare array lengths to determine if a deep comparison is necessary.
                size = a.length;
                result = size == b.length;
                if (result) {
                    // Deep compare the contents, ignoring non-numeric properties.
                    while (size--) {
                        // Ensure commutative equality for sparse arrays.
                        if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
                    }
                }
            } else {
                // Objects with different constructors are not equivalent.
                if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
                // Deep compare objects.
                for (var key in a) {
                    if (_.has(a, key)) {
                        // Count the expected number of properties.
                        size++;
                        // Deep compare each member.
                        if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
                    }
                }
                // Ensure that both objects contain the same number of properties.
                if (result) {
                    for (key in b) {
                        if (_.has(b, key) && !(size--)) break;
                    }
                    result = !size;
                }
            }
            // Remove the first object from the stack of traversed objects.
            stack.pop();
            return result;
        }

        // Perform a deep comparison to check if two objects are equal.
        _.isEqual = function(a, b) {
            return eq(a, b, []);
        };

        // Is a given array, string, or object empty?
        // An "empty" object has no enumerable own-properties.
        _.isEmpty = function(obj) {
            if (obj == null) return true;
            if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
            for (var key in obj) if (_.has(obj, key)) return false;
            return true;
        };

        // Is a given value a DOM element?
        _.isElement = function(obj) {
            return !!(obj && obj.nodeType == 1);
        };

        // Is a given value an array?
        // Delegates to ECMA5's native Array.isArray
        _.isArray = nativeIsArray || function(obj) {
            return toString.call(obj) == '[object Array]';
        };

        // Is a given variable an object?
        _.isObject = function(obj) {
            return obj === Object(obj);
        };

        // Is a given variable an arguments object?
        _.isArguments = function(obj) {
            return toString.call(obj) == '[object Arguments]';
        };
        if (!_.isArguments(arguments)) {
            _.isArguments = function(obj) {
                return !!(obj && _.has(obj, 'callee'));
            };
        }

        // Is a given value a function?
        _.isFunction = function(obj) {
            return toString.call(obj) == '[object Function]';
        };

        // Is a given value a string?
        _.isString = function(obj) {
            return toString.call(obj) == '[object String]';
        };

        // Is a given value a number?
        _.isNumber = function(obj) {
            return toString.call(obj) == '[object Number]';
        };

        // Is a given object a finite number?
        _.isFinite = function(obj) {
            return _.isNumber(obj) && isFinite(obj);
        };

        // Is the given value `NaN`?
        _.isNaN = function(obj) {
            // `NaN` is the only value for which `===` is not reflexive.
            return obj !== obj;
        };

        // Is a given value a boolean?
        _.isBoolean = function(obj) {
            return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
        };

        // Is a given value a date?
        _.isDate = function(obj) {
            return toString.call(obj) == '[object Date]';
        };

        // Is the given value a regular expression?
        _.isRegExp = function(obj) {
            return toString.call(obj) == '[object RegExp]';
        };

        // Is a given value equal to null?
        _.isNull = function(obj) {
            return obj === null;
        };

        // Is a given variable undefined?
        _.isUndefined = function(obj) {
            return obj === void 0;
        };

        // Has own property?
        _.has = function(obj, key) {
            return hasOwnProperty.call(obj, key);
        };

        // Utility Functions
        // -----------------

        // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
        // previous owner. Returns a reference to the Underscore object.
        _.noConflict = function() {
            root._ = previousUnderscore;
            return this;
        };

        // Keep the identity function around for default iterators.
        _.identity = function(value) {
            return value;
        };

        // Run a function **n** times.
        _.times = function (n, iterator, context) {
            for (var i = 0; i < n; i++) iterator.call(context, i);
        };

        // Escape a string for HTML interpolation.
        _.escape = function(string) {
            return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
        };

        // If the value of the named property is a function then invoke it;
        // otherwise, return it.
        _.result = function(object, property) {
            if (object == null) return null;
            var value = object[property];
            return _.isFunction(value) ? value.call(object) : value;
        };

        // Add your own custom functions to the Underscore object, ensuring that
        // they're correctly added to the OOP wrapper as well.
        _.mixin = function(obj) {
            each(_.functions(obj), function(name){
                addToWrapper(name, _[name] = obj[name]);
            });
        };

        // Generate a unique integer id (unique within the entire client session).
        // Useful for temporary DOM ids.
        var idCounter = 0;
        _.uniqueId = function(prefix) {
            var id = idCounter++;
            return prefix ? prefix + id : id;
        };

        // By default, Underscore uses ERB-style template delimiters, change the
        // following template settings to use alternative delimiters.
        _.templateSettings = {
            evaluate    : /<%([\s\S]+?)%>/g,
            interpolate : /<%=([\s\S]+?)%>/g,
            escape      : /<%-([\s\S]+?)%>/g
        };

        // When customizing `templateSettings`, if you don't want to define an
        // interpolation, evaluation or escaping regex, we need one that is
        // guaranteed not to match.
        var noMatch = /.^/;

        // Certain characters need to be escaped so that they can be put into a
        // string literal.
        var escapes = {
            '\\': '\\',
            "'": "'",
            'r': '\r',
            'n': '\n',
            't': '\t',
            'u2028': '\u2028',
            'u2029': '\u2029'
        };

        for (var p in escapes) escapes[escapes[p]] = p;
        var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
        var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

        // Within an interpolation, evaluation, or escaping, remove HTML escaping
        // that had been previously added.
        var unescape = function(code) {
            return code.replace(unescaper, function(match, escape) {
                return escapes[escape];
            });
        };

        // JavaScript micro-templating, similar to John Resig's implementation.
        // Underscore templating handles arbitrary delimiters, preserves whitespace,
        // and correctly escapes quotes within interpolated code.
        _.template = function(text, data, settings) {
            settings = _.defaults(settings || {}, _.templateSettings);

            // Compile the template source, taking care to escape characters that
            // cannot be included in a string literal and then unescape them in code
            // blocks.
            var source = "__p+='" + text
                .replace(escaper, function(match) {
                    return '\\' + escapes[match];
                })
                .replace(settings.escape || noMatch, function(match, code) {
                    return "'+\n_.escape(" + unescape(code) + ")+\n'";
                })
                .replace(settings.interpolate || noMatch, function(match, code) {
                    return "'+\n(" + unescape(code) + ")+\n'";
                })
                .replace(settings.evaluate || noMatch, function(match, code) {
                    return "';\n" + unescape(code) + "\n;__p+='";
                }) + "';\n";

            // If a variable is not specified, place data values in local scope.
            if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

            source = "var __p='';" +
                "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
                source + "return __p;\n";

            var render = new Function(settings.variable || 'obj', '_', source);
            if (data) return render(data, _);
            var template = function(data) {
                return render.call(this, data, _);
            };

            // Provide the compiled function source as a convenience for build time
            // precompilation.
            template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
                source + '}';

            return template;
        };

        // Add a "chain" function, which will delegate to the wrapper.
        _.chain = function(obj) {
            return _(obj).chain();
        };

        // The OOP Wrapper
        // ---------------

        // If Underscore is called as a function, it returns a wrapped object that
        // can be used OO-style. This wrapper holds altered versions of all the
        // underscore functions. Wrapped objects may be chained.
        var wrapper = function(obj) { this._wrapped = obj; };

        // Expose `wrapper.prototype` as `_.prototype`
        _.prototype = wrapper.prototype;

        // Helper function to continue chaining intermediate results.
        var result = function(obj, chain) {
            return chain ? _(obj).chain() : obj;
        };

        // A method to easily add functions to the OOP wrapper.
        var addToWrapper = function(name, func) {
            wrapper.prototype[name] = function() {
                var args = slice.call(arguments);
                unshift.call(args, this._wrapped);
                return result(func.apply(_, args), this._chain);
            };
        };

        // Add all of the Underscore functions to the wrapper object.
        _.mixin(_);

        // Add all mutator Array functions to the wrapper.
        each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
            var method = ArrayProto[name];
            wrapper.prototype[name] = function() {
                var wrapped = this._wrapped;
                method.apply(wrapped, arguments);
                var length = wrapped.length;
                if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
                return result(wrapped, this._chain);
            };
        });

        // Add all accessor Array functions to the wrapper.
        each(['concat', 'join', 'slice'], function(name) {
            var method = ArrayProto[name];
            wrapper.prototype[name] = function() {
                return result(method.apply(this._wrapped, arguments), this._chain);
            };
        });

        // Start chaining a wrapped Underscore object.
        wrapper.prototype.chain = function() {
            this._chain = true;
            return this;
        };

        // Extracts the result from a wrapped and chained object.
        wrapper.prototype.value = function() {
            return this._wrapped;
        };

    }).call(this);

});

require.define("/node_modules/brain/lib/lookup.js", function (require, module, exports, __dirname, __filename) {
    var _ = require("underscore");

    /* Functions for turning sparse hashes into arrays and vice versa */

    function buildLookup(hashes) {
        // [{a: 1}, {b: 6, c: 7}] -> {a: 0, b: 1, c: 2}
        var hash = _(hashes).reduce(function(memo, hash) {
            return _(memo).extend(hash);
        }, {});
        return lookupFromHash(hash);
    }

    function lookupFromHash(hash) {
        // {a: 6, b: 7} -> {a: 0, b: 1}
        var lookup = {};
        var index = 0;
        for (var i in hash) {
            lookup[i] = index++;
        }
        return lookup;
    }

    function toArray(lookup, hash) {
        // {a: 0, b: 1}, {a: 6} -> [6, 0]
        var array = [];
        for (var i in lookup) {
            array[lookup[i]] = hash[i] || 0;
        }
        return array;
    }

    function toHash(lookup, array) {
        // {a: 0, b: 1}, [6, 7] -> {a: 6, b: 7}
        var hash = {};
        for (var i in lookup) {
            hash[i] = array[lookup[i]];
        }
        return hash;
    }

    module.exports = {
        buildLookup: buildLookup,
        lookupFromHash: lookupFromHash,
        toArray: toArray,
        toHash: toHash
    };
});

require.define("/node_modules/brain/lib/cross-validate.js", function (require, module, exports, __dirname, __filename) {
    var _ = require("underscore")._;

    function testPartition(classifierConst, opts, trainOpts, trainSet, testSet) {
        var classifier = new classifierConst(opts);

        var beginTrain = Date.now();

        var trainingStats = classifier.train(trainSet, trainOpts);

        var beginTest = Date.now();

        var testStats = classifier.test(testSet);

        var endTest = Date.now();

        var stats = _(testStats).extend({
            trainTime : beginTest - beginTrain,
            testTime : endTest - beginTest,
            iterations: trainingStats.iterations,
            trainError: trainingStats.error,
            learningRate: classifier.learningRate,
            hidden: classifier.hiddenSizes,
            network: classifier.toJSON()
        });

        return stats;
    }

    module.exports = function crossValidate(classifierConst, data, opts, trainOpts, k) {
        k = k || 4;
        var size = data.length / k;

        data = _(data).sortBy(function() {
            return Math.random();
        });

        var avgs = {
            error : 0,
            trainTime : 0,
            testTime : 0,
            iterations: 0,
            trainError: 0
        };

        var stats = {
            truePos: 0,
            trueNeg: 0,
            falsePos: 0,
            falseNeg: 0,
            total: 0
        };

        var misclasses = [];

        var results = _.range(k).map(function(i) {
            var dclone = _(data).clone();
            var testSet = dclone.splice(i * size, size);
            var trainSet = dclone;

            var result = testPartition(classifierConst, opts, trainOpts, trainSet, testSet);

            _(avgs).each(function(sum, stat) {
                avgs[stat] = sum + result[stat];
            });

            _(stats).each(function(sum, stat) {
                stats[stat] = sum + result[stat];
            })

            misclasses.push(result.misclasses);

            return result;
        });

        _(avgs).each(function(sum, i) {
            avgs[i] = sum / k;
        });

        stats.precision = stats.truePos / (stats.truePos + stats.falsePos);
        stats.recall = stats.truePos / (stats.truePos + stats.falseNeg);
        stats.accuracy = (stats.trueNeg + stats.truePos) / stats.total;

        stats.testSize = size;
        stats.trainSize = data.length - size;

        return {
            avgs: avgs,
            stats: stats,
            sets: results,
            misclasses: _(misclasses).flatten()
        };
    }
});

require.define("/node_modules/hog-descriptor/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"./hog"}
});

require.define("/node_modules/hog-descriptor/hog.js", function (require, module, exports, __dirname, __filename) {
    var processing = require("./processing"),
        norms = require("./norms");

    module.exports = {
        extractHOG: extractHOG,
        extractHOGFromVectors: extractHOGFromVectors
    }

// also export all the functions from processing.js
    for (var func in processing) {
        module.exports[func] = processing[func];
    }

    function extractHOG(canvas, options) {
        var vectors = processing.gradientVectors(canvas);
        return extractHOGFromVectors(vectors, options);
    }

    function extractHOGFromVectors(vectors, options) {
        options = options || {};
        var cellSize = options.cellSize || 4;
        var blockSize = options.blockSize || 2;
        var bins = options.bins || 6;
        var blockStride = options.blockStride || (blockSize / 2);
        var norm = norms[options.norm || "L2"];

        var cellsWide = Math.floor(vectors.length / cellSize);
        var cellsHigh = Math.floor(vectors[0].length / cellSize);

        var histograms = new Array(cellsHigh);

        for (var i = 0; i < cellsHigh; i++) {
            histograms[i] = new Array(cellsWide);

            for (var j = 0; j < cellsWide; j++) {
                histograms[i][j] = getHistogram(vectors, j * cellSize, i * cellSize,
                    cellSize, bins);
            }
        }
        var descriptor = getNormalizedBlocks(histograms, blockSize, blockStride, norm);

        return descriptor;
    }

    function getNormalizedBlocks(histograms, blockSize, blockStride, normalize) {
        var blocks = [];
        var blocksHigh = histograms.length - blockSize + 1;
        var blocksWide = histograms[0].length - blockSize + 1;

        for (var y = 0; y < blocksHigh; y += blockStride) {
            for (var x = 0; x < blocksWide; x += blockStride) {
                var block = getBlock(histograms, x, y, blockSize);
                normalize(block);
                blocks.push(block);
            }
        }
        return Array.prototype.concat.apply([], blocks);
    }

    function getBlock(matrix, x, y, length) {
        var square = [];
        for (var i = y; i < y + length; i++) {
            for (var j = x; j < x + length; j++) {
                square.push(matrix[i][j]);
            }
        }
        return Array.prototype.concat.apply([], square);
    }

    function getHistogram(elements, x, y, size, bins) {
        var histogram = zeros(bins);

        for (var i = 0; i < size; i++) {
            for (var j = 0; j < size; j++) {
                var vector = elements[y + i][x + j];
                var bin = binFor(vector.orient, bins);
                histogram[bin] += vector.mag;
            }
        }
        return histogram;
    }

    function binFor(radians, bins) {
        var angle = radians * (180 / Math.PI);
        if (angle < 0) {
            angle += 180;
        }

        // center the first bin around 0
        angle += 90 / bins;
        angle %= 180;

        var bin = Math.floor(angle / 180 * bins);
        return bin;
    }

    function zeros(size) {
        var array = new Array(size);
        for (var i = 0; i < size; i++) {
            array[i] = 0;
        }
        return array;
    }

});

require.define("/node_modules/hog-descriptor/processing.js", function (require, module, exports, __dirname, __filename) {
    var processing = {
        intensities: function(imagedata) {
            if (!imagedata.data) {
                // it's a canvas, extract the imagedata
                var canvas = imagedata;
                var context = canvas.getContext("2d");
                imagedata = context.getImageData(0, 0, canvas.width, canvas.height);
            }

            var lumas = new Array(imagedata.height);
            for (var y = 0; y < imagedata.height; y++) {
                lumas[y] = new Array(imagedata.width);

                for (var x = 0; x < imagedata.height; x++) {
                    var i = x * 4 + y * 4 * imagedata.width;
                    var r = imagedata.data[i],
                        g = imagedata.data[i + 1],
                        b = imagedata.data[i + 2],
                        a = imagedata.data[i + 3];

                    var luma = a == 0 ? 1 : (r * 299/1000 + g * 587/1000
                        + b * 114/1000) / 255;

                    lumas[y][x] = luma;
                }
            }
            return lumas;
        },

        gradients: function(canvas) {
            var intensities = this.intensities(canvas);
            return this._gradients(intensities);
        },

        _gradients: function(intensities) {
            var height = intensities.length;
            var width = intensities[0].length;

            var gradX = new Array(height);
            var gradY = new Array(height);

            for (var y = 0; y < height; y++) {
                gradX[y] = new Array(width);
                gradY[y] = new Array(height);

                var row = intensities[y];

                for (var x = 0; x < width; x++) {
                    var prevX = x == 0 ? 0 : intensities[y][x - 1];
                    var nextX = x == width - 1 ? 0 : intensities[y][x + 1];
                    var prevY = y == 0 ? 0 : intensities[y - 1][x];
                    var nextY = y == height - 1 ? 0 : intensities[y + 1][x];

                    // kernel [-1, 0, 1]
                    gradX[y][x] = -prevX + nextX;
                    gradY[y][x] = -prevY + nextY;
                }
            }

            return {
                x: gradX,
                y: gradY
            };
        },

        gradientVectors: function(canvas) {
            var intensities = this.intensities(canvas);
            return this._gradientVectors(intensities);
        },

        _gradientVectors: function(intensities) {
            var height = intensities.length;
            var width = intensities[0].length;

            var vectors = new Array(height);

            for (var y = 0; y < height; y++) {
                vectors[y] = new Array(width);

                for (var x = 0; x < width; x++) {
                    var prevX = x == 0 ? 0 : intensities[y][x - 1];
                    var nextX = x == width - 1 ? 0 : intensities[y][x + 1];
                    var prevY = y == 0 ? 0 : intensities[y - 1][x];
                    var nextY = y == height - 1 ? 0 : intensities[y + 1][x];

                    // kernel [-1, 0, 1]
                    var gradX = -prevX + nextX;
                    var gradY = -prevY + nextY;

                    vectors[y][x] = {
                        mag: Math.sqrt(Math.pow(gradX, 2) + Math.pow(gradY, 2)),
                        orient: Math.atan2(gradY, gradX)
                    }
                }
            }
            return vectors;
        },

        drawGreyscale: function(canvas) {
            var ctx = canvas.getContext('2d');
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            var intensities = this.intensities(canvas);

            for (var y = 0; y < imageData.height; y++) {
                for (var x = 0; x < imageData.width; x++) {
                    var i = (y * 4) * imageData.width + x * 4;
                    var luma = intensities[y][x] * 255;

                    imageData.data[i] = luma;
                    imageData.data[i + 1] = luma;
                    imageData.data[i + 2] = luma;
                    imageData.data[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0, 0, 0, imageData.width, imageData.height);
            return canvas;
        },

        drawGradient: function(canvas, dir) {
            var ctx = canvas.getContext("2d");
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            var gradients = this.gradients(canvas);
            var grads = gradients[dir || "x"];

            for (var y = 0; y < imageData.height; y++) {
                for (var x = 0; x < imageData.width; x++) {
                    var i = (y * 4) * imageData.width + x * 4;
                    var grad = Math.abs(grads[y][x]) * 255;

                    imageData.data[i] = grad;
                    imageData.data[i + 1] = grad;
                    imageData.data[i + 2] = grad;
                    imageData.data[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0, 0, 0, imageData.width, imageData.height);
            return canvas;
        },

        drawMagnitude: function(canvas) {
            var ctx = canvas.getContext("2d");
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            var vectors = processing.gradientVectors(canvas);

            for (var y = 0; y < imageData.height; y++) {
                for (var x = 0; x < imageData.width; x++) {
                    var i = (y * 4) * imageData.width + x * 4;
                    var mag = Math.abs(vectors[y][x].mag) * 3 * 255;

                    imageData.data[i] = mag;
                    imageData.data[i + 1] = mag;
                    imageData.data[i + 2] = mag;
                    imageData.data[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0, 0, 0, imageData.width, imageData.height);
            return canvas;
        },

        drawOrients: function(canvas) {
            var ctx = canvas.getContext("2d");
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            var vectors = processing.gradientVectors(canvas);

            for (var y = 0; y < imageData.height; y++) {
                for (var x = 0; x < imageData.width; x++) {
                    var i = (y * 4) * imageData.width + x * 4;
                    var orient = Math.abs(vectors[y][x].orient);
                    orient *= (180 / Math.PI);
                    if (orient < 0) {
                        orient += 180;
                    }
                    orient /= 180 * 255;

                    imageData.data[i] = orient;
                    imageData.data[i + 1] = orient;
                    imageData.data[i + 2] = orient;
                    imageData.data[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0, 0, 0, imageData.width, imageData.height);
            return canvas;
        }
    }

    module.exports = processing;

});

require.define("/node_modules/hog-descriptor/norms.js", function (require, module, exports, __dirname, __filename) {
    var epsilon = 0.00001;

    module.exports = {
        L1: function(vector) {
            var norm = 0;
            for (var i = 0; i < vector.length; i++) {
                norm += Math.abs(vector[i]);
            }
            var denom = norm + epsilon;

            for (var i = 0; i < vector.length; i++) {
                vector[i] /= denom;
            }
        },

        'L1-sqrt': function(vector) {
            var norm = 0;
            for (var i = 0; i < vector.length; i++) {
                norm += Math.abs(vector[i]);
            }
            var denom = norm + epsilon;

            for (var i = 0; i < vector.length; i++) {
                vector[i] = Math.sqrt(vector[i] / denom);
            }
        },

        L2: function(vector) {
            var sum = 0;
            for (var i = 0; i < vector.length; i++) {
                sum += Math.pow(vector[i], 2);
            }
            var denom = Math.sqrt(sum + epsilon);
            for (var i = 0; i < vector.length; i++) {
                vector[i] /= denom;
            }
        }
    }
});

require.define("/repos/kittydar/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"./kittydar"}
});

require.define("/repos/kittydar/network.js", function (require, module, exports, __dirname, __filename) {
    module.exports = {"layers":[{"0":{},"1":{},"2":{},"3":{},"4":{},"5":{},"6":{},"7":{},"8":{},"9":{},"10":{},"11":{},"12":{},"13":{},"14":{},"15":{},"16":{},"17":{},"18":{},"19":{},"20":{},"21":{},"22":{},"23":{},"24":{},"25":{},"26":{},"27":{},"28":{},"29":{},"30":{},"31":{},"32":{},"33":{},"34":{},"35":{},"36":{},"37":{},"38":{},"39":{},"40":{},"41":{},"42":{},"43":{},"44":{},"45":{},"46":{},"47":{},"48":{},"49":{},"50":{},"51":{},"52":{},"53":{},"54":{},"55":{},"56":{},"57":{},"58":{},"59":{},"60":{},"61":{},"62":{},"63":{},"64":{},"65":{},"66":{},"67":{},"68":{},"69":{},"70":{},"71":{},"72":{},"73":{},"74":{},"75":{},"76":{},"77":{},"78":{},"79":{},"80":{},"81":{},"82":{},"83":{},"84":{},"85":{},"86":{},"87":{},"88":{},"89":{},"90":{},"91":{},"92":{},"93":{},"94":{},"95":{},"96":{},"97":{},"98":{},"99":{},"100":{},"101":{},"102":{},"103":{},"104":{},"105":{},"106":{},"107":{},"108":{},"109":{},"110":{},"111":{},"112":{},"113":{},"114":{},"115":{},"116":{},"117":{},"118":{},"119":{},"120":{},"121":{},"122":{},"123":{},"124":{},"125":{},"126":{},"127":{},"128":{},"129":{},"130":{},"131":{},"132":{},"133":{},"134":{},"135":{},"136":{},"137":{},"138":{},"139":{},"140":{},"141":{},"142":{},"143":{},"144":{},"145":{},"146":{},"147":{},"148":{},"149":{},"150":{},"151":{},"152":{},"153":{},"154":{},"155":{},"156":{},"157":{},"158":{},"159":{},"160":{},"161":{},"162":{},"163":{},"164":{},"165":{},"166":{},"167":{},"168":{},"169":{},"170":{},"171":{},"172":{},"173":{},"174":{},"175":{},"176":{},"177":{},"178":{},"179":{},"180":{},"181":{},"182":{},"183":{},"184":{},"185":{},"186":{},"187":{},"188":{},"189":{},"190":{},"191":{},"192":{},"193":{},"194":{},"195":{},"196":{},"197":{},"198":{},"199":{},"200":{},"201":{},"202":{},"203":{},"204":{},"205":{},"206":{},"207":{},"208":{},"209":{},"210":{},"211":{},"212":{},"213":{},"214":{},"215":{},"216":{},"217":{},"218":{},"219":{},"220":{},"221":{},"222":{},"223":{},"224":{},"225":{},"226":{},"227":{},"228":{},"229":{},"230":{},"231":{},"232":{},"233":{},"234":{},"235":{},"236":{},"237":{},"238":{},"239":{},"240":{},"241":{},"242":{},"243":{},"244":{},"245":{},"246":{},"247":{},"248":{},"249":{},"250":{},"251":{},"252":{},"253":{},"254":{},"255":{},"256":{},"257":{},"258":{},"259":{},"260":{},"261":{},"262":{},"263":{},"264":{},"265":{},"266":{},"267":{},"268":{},"269":{},"270":{},"271":{},"272":{},"273":{},"274":{},"275":{},"276":{},"277":{},"278":{},"279":{},"280":{},"281":{},"282":{},"283":{},"284":{},"285":{},"286":{},"287":{},"288":{},"289":{},"290":{},"291":{},"292":{},"293":{},"294":{},"295":{},"296":{},"297":{},"298":{},"299":{},"300":{},"301":{},"302":{},"303":{},"304":{},"305":{},"306":{},"307":{},"308":{},"309":{},"310":{},"311":{},"312":{},"313":{},"314":{},"315":{},"316":{},"317":{},"318":{},"319":{},"320":{},"321":{},"322":{},"323":{},"324":{},"325":{},"326":{},"327":{},"328":{},"329":{},"330":{},"331":{},"332":{},"333":{},"334":{},"335":{},"336":{},"337":{},"338":{},"339":{},"340":{},"341":{},"342":{},"343":{},"344":{},"345":{},"346":{},"347":{},"348":{},"349":{},"350":{},"351":{},"352":{},"353":{},"354":{},"355":{},"356":{},"357":{},"358":{},"359":{},"360":{},"361":{},"362":{},"363":{},"364":{},"365":{},"366":{},"367":{},"368":{},"369":{},"370":{},"371":{},"372":{},"373":{},"374":{},"375":{},"376":{},"377":{},"378":{},"379":{},"380":{},"381":{},"382":{},"383":{},"384":{},"385":{},"386":{},"387":{},"388":{},"389":{},"390":{},"391":{},"392":{},"393":{},"394":{},"395":{},"396":{},"397":{},"398":{},"399":{},"400":{},"401":{},"402":{},"403":{},"404":{},"405":{},"406":{},"407":{},"408":{},"409":{},"410":{},"411":{},"412":{},"413":{},"414":{},"415":{},"416":{},"417":{},"418":{},"419":{},"420":{},"421":{},"422":{},"423":{},"424":{},"425":{},"426":{},"427":{},"428":{},"429":{},"430":{},"431":{},"432":{},"433":{},"434":{},"435":{},"436":{},"437":{},"438":{},"439":{},"440":{},"441":{},"442":{},"443":{},"444":{},"445":{},"446":{},"447":{},"448":{},"449":{},"450":{},"451":{},"452":{},"453":{},"454":{},"455":{},"456":{},"457":{},"458":{},"459":{},"460":{},"461":{},"462":{},"463":{},"464":{},"465":{},"466":{},"467":{},"468":{},"469":{},"470":{},"471":{},"472":{},"473":{},"474":{},"475":{},"476":{},"477":{},"478":{},"479":{},"480":{},"481":{},"482":{},"483":{},"484":{},"485":{},"486":{},"487":{},"488":{},"489":{},"490":{},"491":{},"492":{},"493":{},"494":{},"495":{},"496":{},"497":{},"498":{},"499":{},"500":{},"501":{},"502":{},"503":{},"504":{},"505":{},"506":{},"507":{},"508":{},"509":{},"510":{},"511":{},"512":{},"513":{},"514":{},"515":{},"516":{},"517":{},"518":{},"519":{},"520":{},"521":{},"522":{},"523":{},"524":{},"525":{},"526":{},"527":{},"528":{},"529":{},"530":{},"531":{},"532":{},"533":{},"534":{},"535":{},"536":{},"537":{},"538":{},"539":{},"540":{},"541":{},"542":{},"543":{},"544":{},"545":{},"546":{},"547":{},"548":{},"549":{},"550":{},"551":{},"552":{},"553":{},"554":{},"555":{},"556":{},"557":{},"558":{},"559":{},"560":{},"561":{},"562":{},"563":{},"564":{},"565":{},"566":{},"567":{},"568":{},"569":{},"570":{},"571":{},"572":{},"573":{},"574":{},"575":{},"576":{},"577":{},"578":{},"579":{},"580":{},"581":{},"582":{},"583":{},"584":{},"585":{},"586":{},"587":{},"588":{},"589":{},"590":{},"591":{},"592":{},"593":{},"594":{},"595":{},"596":{},"597":{},"598":{},"599":{},"600":{},"601":{},"602":{},"603":{},"604":{},"605":{},"606":{},"607":{},"608":{},"609":{},"610":{},"611":{},"612":{},"613":{},"614":{},"615":{},"616":{},"617":{},"618":{},"619":{},"620":{},"621":{},"622":{},"623":{},"624":{},"625":{},"626":{},"627":{},"628":{},"629":{},"630":{},"631":{},"632":{},"633":{},"634":{},"635":{},"636":{},"637":{},"638":{},"639":{},"640":{},"641":{},"642":{},"643":{},"644":{},"645":{},"646":{},"647":{},"648":{},"649":{},"650":{},"651":{},"652":{},"653":{},"654":{},"655":{},"656":{},"657":{},"658":{},"659":{},"660":{},"661":{},"662":{},"663":{},"664":{},"665":{},"666":{},"667":{},"668":{},"669":{},"670":{},"671":{},"672":{},"673":{},"674":{},"675":{},"676":{},"677":{},"678":{},"679":{},"680":{},"681":{},"682":{},"683":{},"684":{},"685":{},"686":{},"687":{},"688":{},"689":{},"690":{},"691":{},"692":{},"693":{},"694":{},"695":{},"696":{},"697":{},"698":{},"699":{},"700":{},"701":{},"702":{},"703":{},"704":{},"705":{},"706":{},"707":{},"708":{},"709":{},"710":{},"711":{},"712":{},"713":{},"714":{},"715":{},"716":{},"717":{},"718":{},"719":{},"720":{},"721":{},"722":{},"723":{},"724":{},"725":{},"726":{},"727":{},"728":{},"729":{},"730":{},"731":{},"732":{},"733":{},"734":{},"735":{},"736":{},"737":{},"738":{},"739":{},"740":{},"741":{},"742":{},"743":{},"744":{},"745":{},"746":{},"747":{},"748":{},"749":{},"750":{},"751":{},"752":{},"753":{},"754":{},"755":{},"756":{},"757":{},"758":{},"759":{},"760":{},"761":{},"762":{},"763":{},"764":{},"765":{},"766":{},"767":{},"768":{},"769":{},"770":{},"771":{},"772":{},"773":{},"774":{},"775":{},"776":{},"777":{},"778":{},"779":{},"780":{},"781":{},"782":{},"783":{},"784":{},"785":{},"786":{},"787":{},"788":{},"789":{},"790":{},"791":{},"792":{},"793":{},"794":{},"795":{},"796":{},"797":{},"798":{},"799":{},"800":{},"801":{},"802":{},"803":{},"804":{},"805":{},"806":{},"807":{},"808":{},"809":{},"810":{},"811":{},"812":{},"813":{},"814":{},"815":{},"816":{},"817":{},"818":{},"819":{},"820":{},"821":{},"822":{},"823":{},"824":{},"825":{},"826":{},"827":{},"828":{},"829":{},"830":{},"831":{},"832":{},"833":{},"834":{},"835":{},"836":{},"837":{},"838":{},"839":{},"840":{},"841":{},"842":{},"843":{},"844":{},"845":{},"846":{},"847":{},"848":{},"849":{},"850":{},"851":{},"852":{},"853":{},"854":{},"855":{},"856":{},"857":{},"858":{},"859":{},"860":{},"861":{},"862":{},"863":{},"864":{},"865":{},"866":{},"867":{},"868":{},"869":{},"870":{},"871":{},"872":{},"873":{},"874":{},"875":{},"876":{},"877":{},"878":{},"879":{},"880":{},"881":{},"882":{},"883":{},"884":{},"885":{},"886":{},"887":{},"888":{},"889":{},"890":{},"891":{},"892":{},"893":{},"894":{},"895":{},"896":{},"897":{},"898":{},"899":{},"900":{},"901":{},"902":{},"903":{},"904":{},"905":{},"906":{},"907":{},"908":{},"909":{},"910":{},"911":{},"912":{},"913":{},"914":{},"915":{},"916":{},"917":{},"918":{},"919":{},"920":{},"921":{},"922":{},"923":{},"924":{},"925":{},"926":{},"927":{},"928":{},"929":{},"930":{},"931":{},"932":{},"933":{},"934":{},"935":{},"936":{},"937":{},"938":{},"939":{},"940":{},"941":{},"942":{},"943":{},"944":{},"945":{},"946":{},"947":{},"948":{},"949":{},"950":{},"951":{},"952":{},"953":{},"954":{},"955":{},"956":{},"957":{},"958":{},"959":{},"960":{},"961":{},"962":{},"963":{},"964":{},"965":{},"966":{},"967":{},"968":{},"969":{},"970":{},"971":{},"972":{},"973":{},"974":{},"975":{},"976":{},"977":{},"978":{},"979":{},"980":{},"981":{},"982":{},"983":{},"984":{},"985":{},"986":{},"987":{},"988":{},"989":{},"990":{},"991":{},"992":{},"993":{},"994":{},"995":{},"996":{},"997":{},"998":{},"999":{},"1000":{},"1001":{},"1002":{},"1003":{},"1004":{},"1005":{},"1006":{},"1007":{},"1008":{},"1009":{},"1010":{},"1011":{},"1012":{},"1013":{},"1014":{},"1015":{},"1016":{},"1017":{},"1018":{},"1019":{},"1020":{},"1021":{},"1022":{},"1023":{},"1024":{},"1025":{},"1026":{},"1027":{},"1028":{},"1029":{},"1030":{},"1031":{},"1032":{},"1033":{},"1034":{},"1035":{},"1036":{},"1037":{},"1038":{},"1039":{},"1040":{},"1041":{},"1042":{},"1043":{},"1044":{},"1045":{},"1046":{},"1047":{},"1048":{},"1049":{},"1050":{},"1051":{},"1052":{},"1053":{},"1054":{},"1055":{},"1056":{},"1057":{},"1058":{},"1059":{},"1060":{},"1061":{},"1062":{},"1063":{},"1064":{},"1065":{},"1066":{},"1067":{},"1068":{},"1069":{},"1070":{},"1071":{},"1072":{},"1073":{},"1074":{},"1075":{},"1076":{},"1077":{},"1078":{},"1079":{},"1080":{},"1081":{},"1082":{},"1083":{},"1084":{},"1085":{},"1086":{},"1087":{},"1088":{},"1089":{},"1090":{},"1091":{},"1092":{},"1093":{},"1094":{},"1095":{},"1096":{},"1097":{},"1098":{},"1099":{},"1100":{},"1101":{},"1102":{},"1103":{},"1104":{},"1105":{},"1106":{},"1107":{},"1108":{},"1109":{},"1110":{},"1111":{},"1112":{},"1113":{},"1114":{},"1115":{},"1116":{},"1117":{},"1118":{},"1119":{},"1120":{},"1121":{},"1122":{},"1123":{},"1124":{},"1125":{},"1126":{},"1127":{},"1128":{},"1129":{},"1130":{},"1131":{},"1132":{},"1133":{},"1134":{},"1135":{},"1136":{},"1137":{},"1138":{},"1139":{},"1140":{},"1141":{},"1142":{},"1143":{},"1144":{},"1145":{},"1146":{},"1147":{},"1148":{},"1149":{},"1150":{},"1151":{},"1152":{},"1153":{},"1154":{},"1155":{},"1156":{},"1157":{},"1158":{},"1159":{},"1160":{},"1161":{},"1162":{},"1163":{},"1164":{},"1165":{},"1166":{},"1167":{},"1168":{},"1169":{},"1170":{},"1171":{},"1172":{},"1173":{},"1174":{},"1175":{}},{"0":{"bias":-0.15978067116260344,"weights":{"0":0.008632892121882263,"1":-0.08013706204815411,"2":0.17457833723622324,"3":0.18119922035296007,"4":0.2054918308942051,"5":0.20584150008905217,"6":0.014787678458857666,"7":0.04499112904190728,"8":0.14251816402358422,"9":-0.044356432051281466,"10":0.1120930024742066,"11":-0.0187199840662966,"12":0.051709793745655576,"13":-0.010692522123226737,"14":0.02075178081349415,"15":-0.1385299167832801,"16":-0.14526372741503366,"17":0.08034275110396116,"18":0.17622201075661928,"19":-0.18432609702899824,"20":-0.2064748353455071,"21":-0.0463976716263019,"22":0.21504651959022145,"23":0.09973991780810237,"24":-0.1147351727030356,"25":0.14101236481138033,"26":-0.21493171354002227,"27":-0.13083941852475112,"28":0.15217317682714315,"29":0.20553554235833493,"30":0.11414976970897704,"31":-0.042157682704635276,"32":0.09272691088110961,"33":-0.033076278303881226,"34":0.19700252444899854,"35":-0.1369332612453758,"36":0.14066444477804835,"37":0.037210494091567285,"38":0.08041262007994142,"39":0.039293130091782896,"40":-0.166808440054257,"41":0.20245982662150772,"42":0.014401100437796258,"43":-0.1616317450496215,"44":-0.19861441459233797,"45":0.07729825458162433,"46":0.14088848345129706,"47":-0.03386159299355694,"48":0.00347234630533322,"49":-0.18656363252765404,"50":-0.1317268667854664,"51":-0.0772905386622804,"52":0.12002373382521977,"53":-0.1783883388887018,"54":-0.10415719557464291,"55":0.07407895547643051,"56":0.1060342600424434,"57":0.10585444734903604,"58":0.11627003463524532,"59":0.12228924523140446,"60":-0.1295617001127702,"61":0.04668036224160364,"62":-0.16078228180733,"63":0.06420992505492067,"64":-0.12770086655747687,"65":0.22579802757123044,"66":0.2404335148412911,"67":-0.11441286471042991,"68":-0.1359250435890999,"69":-0.13119085265952704,"70":0.1808749835266915,"71":0.025132557389008648,"72":0.22154253076055244,"73":-0.09031721973054302,"74":-0.16129630676726253,"75":-0.040813813065708464,"76":-0.17214172872892605,"77":-0.1754333665263414,"78":0.09384037225170903,"79":0.07771460141322091,"80":-0.09924829066363408,"81":-0.08993117424134248,"82":0.09018187338951462,"83":-0.008505807730902594,"84":0.10037544848266777,"85":0.12455287994668275,"86":-0.16751051780670395,"87":-0.14924650936055647,"88":-0.06154926827594335,"89":0.17261621116299974,"90":-0.15271550619870586,"91":-0.13039946931697247,"92":-0.08443662991006703,"93":0.013835808433086452,"94":-0.04247687966361453,"95":0.03790714317195657,"96":0.1096045960647244,"97":-0.011442212833477986,"98":-0.09595742327607551,"99":0.02792840456825074,"100":0.18572668579826027,"101":0.04797623122124639,"102":-0.018795567441306813,"103":-0.1836654619080482,"104":-0.07248645539997958,"105":0.03319056024426411,"106":-0.18165662868355298,"107":-0.026392341365015178,"108":0.017018772887124153,"109":0.11426873718441728,"110":0.009267461904557739,"111":-0.11639316557896535,"112":-0.17041128435293856,"113":-0.04897932384757256,"114":0.08055094679404705,"115":-0.07176428191259643,"116":0.193971545650477,"117":0.04030697307301976,"118":0.02430388729280618,"119":-0.20427479570214188,"120":-0.0683820165526697,"121":0.14302421463635562,"122":-0.11648507817243203,"123":-0.11443514035782362,"124":-0.12621662502084802,"125":0.12709022121612315,"126":0.10300544865575227,"127":-0.06123771579752418,"128":-0.061788961432514417,"129":0.0764681455907853,"130":-0.03830777137595426,"131":0.1430186940547084,"132":0.10624782029705596,"133":0.05159795786876874,"134":-0.029714714341899158,"135":0.12241548639213515,"136":-0.09371196438319224,"137":-0.06322064040542674,"138":0.15957829405183888,"139":-0.19203287370722152,"140":-0.15573085072322077,"141":-0.035842103481964656,"142":-0.17341749302817247,"143":-0.08027553653851545,"144":-0.13177534189962503,"145":0.04758251578144571,"146":-0.002214382750074415,"147":0.07903622166212286,"148":0.1398427154149218,"149":-0.060266696976400615,"150":-0.10732119236402558,"151":-0.15831193787906106,"152":-0.15904003331296912,"153":-0.17387593437346857,"154":-0.151078957278232,"155":0.062284689948485523,"156":0.13415864714653516,"157":0.0942275306259947,"158":0.04618834415286808,"159":-0.00003722516904164756,"160":0.08297129358740495,"161":0.08966946660116566,"162":0.08264864066693303,"163":0.11859877639968679,"164":0.01744736004852578,"165":-0.08884440248332404,"166":0.030691265668194807,"167":-0.1392949335192218,"168":0.10964491848014452,"169":0.14117670295155657,"170":-0.11688611996229044,"171":-0.008576755176597683,"172":-0.061585128398838826,"173":0.1913431786501285,"174":0.14318481006380743,"175":-0.20589183489421425,"176":-0.07687260550389642,"177":-0.0874729997123926,"178":0.21693501024380046,"179":0.19722638033608791,"180":-0.08968443159221255,"181":-0.12300959790080941,"182":-0.1556903127601104,"183":0.056680750862806925,"184":0.1514077294880135,"185":0.07208005852350612,"186":0.016073538873428137,"187":-0.2640480158266755,"188":0.027325551748721196,"189":-0.10896986312526326,"190":-0.11853039722708002,"191":-0.07229078960691024,"192":0.04451317829868153,"193":-0.011233075490572583,"194":-0.1943665797495964,"195":-0.09487131217544853,"196":-0.11068666114126066,"197":0.033670047092090476,"198":0.24409085371735437,"199":0.09325329561355258,"200":-0.15464093085498684,"201":-0.14828388648658794,"202":-0.14186960125025258,"203":0.020194691587752788,"204":0.18999146564162814,"205":-0.16741564590679367,"206":-0.1546523127185316,"207":0.26331782679238486,"208":0.03503328740934667,"209":0.2246985974018271,"210":0.25581568172394326,"211":-0.03917267972558047,"212":-0.016991407410359774,"213":0.014633158131538714,"214":-0.07101034716274415,"215":0.16673401214482597,"216":-0.06895936848965205,"217":0.05164185257137239,"218":-0.3301472873037038,"219":0.02225779631456407,"220":0.029729587085245476,"221":-0.1071391615068334,"222":-0.03868474928023288,"223":0.11821728688311901,"224":-0.10896973956025093,"225":0.1631644821231797,"226":0.06811734298658007,"227":0.007431444269547833,"228":0.015538520163741945,"229":0.044023784632236544,"230":-0.0016274217015419508,"231":0.022442587566016883,"232":-0.032069570233825784,"233":-0.1692085290742594,"234":0.15734158561290745,"235":0.030479331073090775,"236":0.07270534732126549,"237":0.08654504894289647,"238":-0.12736120426994768,"239":0.03961378020200983,"240":0.05446798943485561,"241":0.14158918065870427,"242":0.02609193906171072,"243":0.19951508158607872,"244":0.13866887155735055,"245":-0.11661981210168575,"246":0.15175229706361107,"247":0.10414436190806296,"248":0.0369952473745373,"249":0.16533654408272686,"250":0.039475102186608775,"251":-0.17696918836258704,"252":-0.02308215197618219,"253":0.11780935512420125,"254":-0.006058987102054834,"255":-0.09665693188519572,"256":0.16911312522533087,"257":-0.07867442776051942,"258":0.025266257459877213,"259":-0.0591984436149659,"260":-0.09696230722162853,"261":-0.09208485497798861,"262":-0.11981114996354897,"263":-0.11685643110190899,"264":0.19365829417745103,"265":0.2224189647702025,"266":-0.05228298608591758,"267":-0.029701603405671614,"268":0.11423594629845134,"269":-0.0752668130193725,"270":0.0007591114700185858,"271":0.19933651261752142,"272":0.14559893924712472,"273":0.1404789769820048,"274":-0.1686547016340546,"275":0.08659177796631823,"276":0.11549510581896164,"277":0.2664960856314195,"278":0.09495617827529744,"279":0.14179252913425866,"280":-0.08951643520748308,"281":-0.01996486965889558,"282":0.15777320693463112,"283":0.1313698933875464,"284":-0.14922406469499938,"285":-0.027353180479785508,"286":-0.15159838909111054,"287":-0.09960624943698561,"288":0.1953164914923824,"289":-0.07233902137867819,"290":-0.12951383831734514,"291":-0.044377822275137,"292":0.1307554303535047,"293":-0.17831766275864874,"294":-0.16903218501111247,"295":-0.04385309046750131,"296":0.057850680234835736,"297":-0.12579109468649585,"298":-0.16884779743360404,"299":0.07815521936601803,"300":-0.06821648483138198,"301":0.08281402262630873,"302":0.22842175828758962,"303":0.011720469066650294,"304":-0.252793603826218,"305":0.012171915554109755,"306":-0.1013818564632272,"307":-0.04623810466088381,"308":-0.05421533347398186,"309":-0.07200271283144322,"310":-0.13824820641957175,"311":0.07072018160408917,"312":-0.1849166520482747,"313":0.1318931913219997,"314":-0.07780913008170957,"315":-0.03586493952732656,"316":-0.07356806389572126,"317":0.0094460215644917,"318":0.14543196758413895,"319":0.10595429567159469,"320":0.05843027300691262,"321":-0.130696835145993,"322":0.20738104726394999,"323":-0.14710698072802306,"324":-0.041124898685469403,"325":0.06291538400052657,"326":-0.022672130164948748,"327":-0.05663197582997235,"328":-0.0984158252153171,"329":-0.08352444774122443,"330":0.1867695979643064,"331":-0.08554870923368307,"332":0.15226312565952652,"333":0.15602505167713276,"334":-0.05867283319235677,"335":-0.19319817244428106,"336":-0.11753173236424866,"337":-0.24241095162159945,"338":-0.022031232857413884,"339":0.03506995360165292,"340":0.09763000098765506,"341":0.1397840141591217,"342":0.22611181355194537,"343":-0.19741753259634096,"344":0.021886943794530066,"345":0.2658451228674998,"346":0.16618301145063546,"347":0.21067138888073023,"348":0.0625079487824501,"349":0.1060779545167244,"350":-0.042926499492468635,"351":0.15643232731183337,"352":-0.09378073252646615,"353":0.14959929164936867,"354":0.06569544778907246,"355":-0.2261338963076613,"356":-0.1586378150599951,"357":-0.10451693671674217,"358":0.1773300755731045,"359":-0.0760344770257284,"360":-0.019186086992059915,"361":-0.10157944737895087,"362":-0.14770287232149518,"363":0.1535448596072776,"364":0.14898743759426505,"365":-0.11902826983569757,"366":0.006186598922860028,"367":-0.024497305491685578,"368":-0.04694351343103405,"369":-0.10901607621719599,"370":-0.04385818864394585,"371":-0.09322539737863829,"372":-0.04440026849537642,"373":0.058109811441246544,"374":0.0912763901329968,"375":0.21408743120287718,"376":-0.14899896077792402,"377":0.18698504968978596,"378":-0.0814385294741619,"379":0.14306842894770028,"380":-0.0038965102589960405,"381":-0.07520419992361296,"382":0.20819150223533572,"383":0.14563099443006192,"384":0.006701080420536826,"385":-0.13104240873375878,"386":-0.0156458631461731,"387":0.20863752729262752,"388":-0.006729588917671668,"389":0.0883534648820077,"390":0.1766026171654853,"391":-0.08744847519868107,"392":0.0024996030072026816,"393":-0.1386053718636481,"394":-0.030837607030290773,"395":-0.17094064156392055,"396":-0.08310182899000287,"397":-0.003240253060053079,"398":0.053927563752085905,"399":-0.04417789835601549,"400":-0.037961007828736786,"401":0.18283254489079678,"402":0.17352279370016535,"403":-0.0642713708454104,"404":-0.00968372727448332,"405":0.0956362410008392,"406":-0.1102109177175043,"407":0.054865491551058965,"408":0.07687128817195574,"409":-0.1418288186478736,"410":0.045115771228246254,"411":-0.02322932464695777,"412":0.09660184861180621,"413":-0.047920556501208134,"414":0.11205275525614729,"415":0.13399889048616814,"416":-0.19207316537976163,"417":0.04989323039406657,"418":-0.10513009934789162,"419":-0.09813719598897203,"420":0.10270269481316677,"421":-0.008202542006042913,"422":0.17282753612903617,"423":0.15832047004772717,"424":-0.12424599741094082,"425":-0.0898684835916367,"426":0.009333661466019133,"427":-0.06570049774092004,"428":-0.03038534575684774,"429":0.11030817279580855,"430":-0.17284993177489133,"431":-0.07983716598484228,"432":0.1865867977194707,"433":0.010488335360364651,"434":-0.14042514061448452,"435":-0.02654188428953399,"436":0.04299702292198197,"437":-0.15884215878066935,"438":0.12284486547476892,"439":0.20474450523586088,"440":0.050147128625031005,"441":-0.07576026137953581,"442":-0.006080617374592422,"443":0.22477980457944302,"444":-0.10273868821542197,"445":-0.14674611968652426,"446":0.0009551474056849356,"447":0.05550377701816495,"448":-0.01725225728539386,"449":-0.09907825449207312,"450":0.05006867043536404,"451":-0.10144359947796149,"452":-0.05365887558127922,"453":0.22375236098260473,"454":-0.06147152231482103,"455":-0.1442767122009439,"456":-0.049541544228241405,"457":0.19482087988052768,"458":0.1848854722047167,"459":0.11583518573120594,"460":0.10284582541562894,"461":0.08791606385692914,"462":0.14843476823851995,"463":-0.012315981510616612,"464":0.08375415208756645,"465":-0.02076552726573021,"466":-0.2602123844553725,"467":-0.03919675815623777,"468":0.020829325796599924,"469":-0.10831614452714876,"470":0.09914497556653797,"471":0.2095996194196837,"472":0.05103767752447627,"473":0.16972400746105892,"474":0.21462897152539331,"475":0.12095582364064189,"476":-0.1392098141792457,"477":0.18046887798083525,"478":-0.14503554693083656,"479":-0.09303950298676529,"480":0.15209796507188433,"481":-0.18471523473028997,"482":-0.15956019875178032,"483":0.045650865385507514,"484":-0.16874385591506802,"485":0.017737853467092595,"486":0.1576916773836748,"487":0.10362793895945177,"488":0.05767927076862525,"489":0.07631725158539594,"490":0.09384904455079299,"491":0.1247139218139564,"492":-0.07035921774346468,"493":0.026107915394616557,"494":0.08974293699762251,"495":0.1122641042011044,"496":0.13677593475112704,"497":0.1813632978497856,"498":0.10186149414230553,"499":-0.043400777356077135,"500":-0.15054987353851293,"501":-0.001128323832950208,"502":-0.04144014543940109,"503":0.13866605310045174,"504":-0.1563284663345713,"505":0.032450036493383565,"506":0.07833259639947189,"507":0.030057209875946324,"508":0.004809916668668031,"509":0.18023253361876385,"510":-0.07952519888558458,"511":0.08277934904547332,"512":0.15283464911989492,"513":0.12078090159187295,"514":0.12800274627575747,"515":0.143594495087096,"516":-0.017848573704415668,"517":0.13881659244287478,"518":-0.012376419871379862,"519":0.06205772812217536,"520":0.07371166205194778,"521":-0.11647268148431565,"522":-0.03997541105484927,"523":-0.03164312808969804,"524":0.009154470418704149,"525":0.13215281913393823,"526":-0.12428256135221538,"527":-0.15379502740091255,"528":-0.1693495918367097,"529":0.09952907933208133,"530":0.0954616227935266,"531":-0.12133395840618819,"532":0.11088828586522424,"533":-0.03367169992191471,"534":0.21199043698962214,"535":0.057445494660775115,"536":0.1602955906248435,"537":-0.14097384015445452,"538":-0.1382254559597617,"539":-0.02362664182224477,"540":-0.06793456391594067,"541":0.0009723678528568068,"542":-0.09733836091227194,"543":-0.13325874552151884,"544":-0.18969036252796986,"545":-0.15665259170988674,"546":0.10788727194864296,"547":-0.08265712180829755,"548":0.15821678901150504,"549":-0.08147459671200007,"550":-0.08544622143195058,"551":-0.16276940491014152,"552":-0.03524744124262615,"553":-0.16305734205954323,"554":-0.1706300474879079,"555":0.21237364962007582,"556":-0.18277446483761367,"557":0.054282383090292534,"558":-0.13188735100602433,"559":0.05612317006506589,"560":0.17442924263310008,"561":-0.013335758368415163,"562":-0.04925093016876162,"563":0.19333115618345834,"564":0.09958133454654207,"565":0.15043655814297635,"566":-0.022790010461167375,"567":-0.13781695633951144,"568":0.1932822079837554,"569":-0.1495258886532758,"570":0.07234861131647066,"571":-0.14034734942911978,"572":-0.07521137880316532,"573":0.14229006696088908,"574":0.079197318053054,"575":0.13761376014387414,"576":0.01163156147483267,"577":0.1250255114805331,"578":-0.15947657077618063,"579":0.18407887950054308,"580":-0.07546080759087934,"581":0.13832068196081193,"582":0.035568698954257134,"583":-0.15127701444108965,"584":-0.14712325805293147,"585":-0.1347685934532297,"586":-0.2546165581736391,"587":-0.1460557574739294,"588":0.20969475730630924,"589":-0.1471990631577011,"590":0.11638988558492602,"591":0.20161987172019097,"592":-0.09966014766272728,"593":-0.13534661431933526,"594":0.008869794551682322,"595":0.12087561653998137,"596":0.0775220917033181,"597":0.22881973504441783,"598":-0.09361482244666854,"599":0.0974262840543079,"600":0.15450010565928077,"601":0.17118958394397318,"602":0.007984775188213871,"603":-0.09276403365905636,"604":0.15737695774779203,"605":0.07037245950550748,"606":-0.031151986526523113,"607":0.012127474372583802,"608":-0.11757216847391416,"609":0.11587501908563376,"610":0.019646682362665396,"611":-0.11577071055218925,"612":-0.12757089668297208,"613":0.20637819363120188,"614":-0.14657949400717477,"615":-0.033615489420316357,"616":0.0004602094330809976,"617":0.22565409950893442,"618":0.025381097557516708,"619":-0.0035106486932277225,"620":-0.007028241297887863,"621":-0.0253568002946263,"622":-0.02272548034519654,"623":0.14405952554982449,"624":-0.1432613789220071,"625":-0.067261978896445,"626":0.03284105849901617,"627":-0.014918575517534224,"628":0.16086741963451012,"629":-0.014933977234839826,"630":0.07586742277862937,"631":-0.0254150345233002,"632":0.06935950793310088,"633":0.07541571224093513,"634":-0.17315196881847442,"635":0.03943842033993048,"636":0.18369952609841636,"637":0.15290755317578358,"638":0.18460873432821256,"639":0.1277528286763089,"640":0.03947628409806168,"641":0.0952870271296411,"642":0.189988876346373,"643":-0.0746385186679159,"644":0.18077791751203623,"645":0.07434407363621603,"646":0.04388491005356525,"647":-0.15941775575167172,"648":0.06986006036860463,"649":-0.0007535692514861641,"650":-0.1337398478179102,"651":0.1354940695975053,"652":-0.18037883607319466,"653":0.13426045320380883,"654":-0.19000484298311732,"655":-0.03486702888633213,"656":0.06214977509991842,"657":0.18851163511425495,"658":-0.010926035886750552,"659":-0.22415911505889,"660":-0.13181217739422574,"661":0.08292570688121387,"662":0.05020334753424143,"663":0.13261252024725267,"664":0.0872396104156566,"665":0.06067417884059693,"666":-0.005903775297267973,"667":-0.15203280580721412,"668":0.12308900801818266,"669":0.12564788560158344,"670":-0.03304939571068451,"671":-0.1841092640444101,"672":-0.1733689845850574,"673":0.1274261094326852,"674":0.19942398679010565,"675":-0.05988959611225875,"676":0.028320756760941288,"677":0.11909925628918828,"678":-0.0034973101748133157,"679":0.10477299368439867,"680":0.11982815251825851,"681":0.20602522861837227,"682":-0.028965220122439725,"683":0.06281482711457148,"684":-0.05340321042946102,"685":0.13148187653252785,"686":0.15665356510701386,"687":0.020378550434454922,"688":-0.1270627824766747,"689":-0.1831473558855988,"690":-0.14945390609077255,"691":-0.030711785150099185,"692":0.21506678393305226,"693":0.05844077405009797,"694":-0.04884045331135983,"695":-0.0004324481400318251,"696":-0.2388309754863221,"697":-0.1998146007744569,"698":-0.11301996916871555,"699":0.22942443188217065,"700":-0.02751106385800012,"701":0.12718047844206512,"702":-0.14136678318820334,"703":-0.03788296539409771,"704":0.08740996759667874,"705":0.044346837896849976,"706":-0.07585818784128391,"707":-0.12236441907982358,"708":0.134582406467146,"709":0.043160085028355395,"710":-0.1439979640237541,"711":-0.09487531334781335,"712":0.1488623088614406,"713":-0.15518856435633863,"714":-0.09745319788591295,"715":-0.07916570024376912,"716":-0.15584042189696548,"717":0.013094150452299662,"718":0.14018861291369203,"719":0.1623843377684043,"720":-0.15119872984747926,"721":0.09579890602617773,"722":0.08532122821770431,"723":0.24658016917134112,"724":-0.0106031260734205,"725":-0.19781969828605903,"726":-0.03686345614054425,"727":-0.12906271470682062,"728":-0.033675288767349015,"729":-0.047784464919007,"730":0.2047509805894563,"731":-0.09617704167593465,"732":-0.02322859492602979,"733":-0.20789995161214692,"734":-0.053896218049806564,"735":0.001616561812745518,"736":-0.1554141460617369,"737":-0.12045201420701242,"738":0.22848512902460222,"739":0.015827978594976175,"740":-0.005953866303885773,"741":-0.05876155238076257,"742":0.15250480081423579,"743":0.07506649180587636,"744":0.04335069653647568,"745":-0.15149082688223978,"746":-0.17799044153372204,"747":0.198126936184562,"748":-0.12992651774198982,"749":-0.06102142891547176,"750":0.13127334692160875,"751":0.08194406702747518,"752":0.0648499088908315,"753":0.02023517655083809,"754":-0.02475913666713792,"755":0.032262865416052354,"756":-0.0531885448384322,"757":-0.17062545530061496,"758":-0.16673996282359613,"759":0.23374354794844315,"760":0.1011848500394412,"761":0.11332754809108055,"762":0.10428135413646702,"763":-0.19954002012179306,"764":-0.09253269328908231,"765":0.16099031198203306,"766":0.2317308952111571,"767":-0.04979462572226805,"768":0.02484766070884567,"769":-0.018119127427271602,"770":-0.12103980851297061,"771":0.09546424547015615,"772":0.16104192268537304,"773":0.07688601425248215,"774":0.1447409410864544,"775":0.03542080245815404,"776":0.1894336389681729,"777":-0.10972139496220275,"778":0.2075470269005799,"779":-0.06380678485236309,"780":0.09485267916543752,"781":0.08725495438547017,"782":0.06100293993720011,"783":0.2345550899323826,"784":-0.024216949871056076,"785":0.018352689145025487,"786":0.012177486999309605,"787":0.04243563638077168,"788":0.16745228680966887,"789":0.14506039022221687,"790":0.2127907478172358,"791":0.0842836124426472,"792":0.14576111103482642,"793":-0.1348203702024596,"794":-0.09058721857565903,"795":0.20022817636913487,"796":0.16727503792339413,"797":0.2385969497304057,"798":-0.003687630535774436,"799":-0.16919599799603213,"800":-0.09588917102692651,"801":0.09767036406997147,"802":0.156792383723528,"803":-0.09076604200248324,"804":-0.16994055291090981,"805":0.14951072429523815,"806":0.03840427944979864,"807":0.2307877499773631,"808":0.1479621851688961,"809":-0.03571758009753468,"810":0.1122061633139483,"811":-0.2190559097320362,"812":-0.08701548694888699,"813":0.1538255308963998,"814":-0.10218960072978517,"815":-0.13847690733868792,"816":0.14505895148621495,"817":0.03646173736425394,"818":-0.014563998941348029,"819":0.1852767819066382,"820":-0.11314911770772444,"821":-0.07022749607473248,"822":-0.019447668974588894,"823":-0.14154917626907876,"824":0.16710236494028385,"825":-0.06950135472845036,"826":-0.1847292458716333,"827":0.14555624181366073,"828":-0.10428891874904678,"829":-0.19643585374673844,"830":0.028389887948459938,"831":0.04287392801613456,"832":0.18249968508352896,"833":-0.003739475856311719,"834":-0.0009597979723465733,"835":0.10201279885362982,"836":0.08421289399900335,"837":-0.10080054479237416,"838":0.08215232909319176,"839":-0.08653928029452879,"840":0.11939157641314031,"841":0.16993913763790797,"842":-0.06799024894980446,"843":0.23059730233777173,"844":0.048721618772610886,"845":-0.22732746041917892,"846":-0.13398948570958677,"847":0.07122924392137292,"848":0.12822106237990125,"849":0.16273507070922694,"850":-0.14070984867729178,"851":0.00809215636451821,"852":-0.20623180384849674,"853":-0.11448971390276434,"854":-0.030674834090288296,"855":0.1807222344710094,"856":0.1590265617450924,"857":-0.016214750075338784,"858":-0.05722567636794896,"859":-0.11563892824148643,"860":-0.16470852122124136,"861":0.1713224974156198,"862":-0.10633009232395468,"863":-0.11935763909316308,"864":-0.17304813686991205,"865":0.18717005189000124,"866":0.16337319856527108,"867":-0.03183627258128946,"868":-0.012694425071377594,"869":-0.06079774306949648,"870":0.18852671517658512,"871":0.0009485398604291483,"872":0.059384551708973936,"873":0.19388344115635311,"874":0.22176285951106886,"875":-0.1587196682005099,"876":-0.22883721842954569,"877":0.07714191225743551,"878":0.21140201754143959,"879":0.16684076264569578,"880":0.062294421725944106,"881":-0.22333471537333363,"882":0.09568954348998684,"883":0.05722128046606329,"884":0.06918485181803699,"885":0.0860382018054625,"886":-0.12466447416628022,"887":0.07278949401153156,"888":-0.1570467738686193,"889":0.03326717571310951,"890":-0.15892657079006112,"891":0.1853671311228152,"892":-0.028842281044823788,"893":-0.159096445163727,"894":-0.03426479324982152,"895":-0.12349568032455886,"896":-0.16530611201575937,"897":0.14710633350073493,"898":0.017839341902586688,"899":0.20454991383105084,"900":0.08658779597212263,"901":-0.178175265684645,"902":-0.07990166414589608,"903":-0.11758412912504783,"904":-0.1870994150558948,"905":-0.001855243918491662,"906":0.191825026627159,"907":0.14374081635468466,"908":-0.1334746249405278,"909":0.14007364131858577,"910":0.14817408553370234,"911":0.008768343436342764,"912":0.23801895966510037,"913":-0.054887979877359265,"914":0.17584784354580565,"915":0.0842053928545931,"916":0.17861311571685598,"917":-0.02916331549859676,"918":0.1652379652538939,"919":-0.010538989591673372,"920":-0.07159007192237113,"921":0.09736543470364381,"922":-0.05312520253141151,"923":0.03854712844247242,"924":0.05269732550715914,"925":-0.011236211489519542,"926":-0.18590384668349372,"927":-0.17452538605276482,"928":-0.08353846248793476,"929":-0.14898436601629592,"930":-0.09973149784628794,"931":-0.06892449886283761,"932":-0.21863166892651362,"933":-0.07410155195410772,"934":-0.04351699720534151,"935":0.09550002333219987,"936":0.13243258690286058,"937":-0.11252988416930314,"938":0.05762882866325593,"939":0.05235210603175285,"940":0.04324168418554117,"941":0.054990183154033326,"942":-0.17395738750573247,"943":-0.11351090343105766,"944":0.13829597609318847,"945":-0.08660885305578601,"946":-0.03972469031974265,"947":-0.027527194883350384,"948":0.113872262492476,"949":0.1613808355284575,"950":-0.18349730824269941,"951":-0.10524857402671099,"952":0.05835582332907828,"953":-0.0452508054625021,"954":-0.23133865789356206,"955":-0.000032875419015935555,"956":0.15772321277929396,"957":-0.053057242272109756,"958":0.01445520668666576,"959":-0.13322687876430023,"960":0.16934498620060737,"961":-0.13948312593967047,"962":0.04255784392467378,"963":-0.04874852596753763,"964":0.17083309598654964,"965":0.16541765856322357,"966":0.20349235535636911,"967":0.12977337671233885,"968":0.1803945817533337,"969":0.011804812047844376,"970":0.0631694345384374,"971":0.12473025466153762,"972":-0.12164901851232986,"973":-0.12449037504985905,"974":0.18539257801943584,"975":0.1392937258694909,"976":0.17688578801661572,"977":-0.15897586968713537,"978":0.10229373288989507,"979":0.1134388352444226,"980":-0.11290573684437727,"981":0.18103815686923116,"982":-0.022483279644474774,"983":-0.12681966653756155,"984":0.1736167232132644,"985":-0.17863547962508375,"986":-0.11478113379886848,"987":-0.016608929656154504,"988":0.18506181015856157,"989":-0.010457748000014793,"990":-0.08431296725400377,"991":-0.1319613923653537,"992":0.09646745880498525,"993":0.08849314269861044,"994":0.13451468720926604,"995":0.024796059454119248,"996":0.052230934895924334,"997":-0.15670666334289926,"998":0.05082581026943179,"999":0.20006157637213268,"1000":-0.00012479604481280125,"1001":-0.0879522750446364,"1002":-0.07420304532729248,"1003":-0.11106528333216362,"1004":-0.02947897428003389,"1005":-0.13250588575047667,"1006":0.05435242212945435,"1007":0.15628914721006598,"1008":0.0069344476591768605,"1009":-0.04031748826710437,"1010":0.22231200715051924,"1011":0.017992346875538322,"1012":-0.10789797985776141,"1013":-0.1500530121720254,"1014":0.07853282917820036,"1015":0.02746138862665242,"1016":0.12138061305647643,"1017":-0.042652970581989046,"1018":-0.10742466692504812,"1019":-0.1797413940638074,"1020":-0.2645370168138738,"1021":-0.10059556335280936,"1022":-0.13752098320548375,"1023":0.0687164143263696,"1024":0.08617514732127803,"1025":-0.038207398991595684,"1026":0.06702031763106218,"1027":0.20711650535097054,"1028":0.1359671023896158,"1029":0.00746858085541049,"1030":0.10514787730007755,"1031":0.16484692707753257,"1032":0.03575523729037958,"1033":0.02354760732826612,"1034":0.086969021483124,"1035":-0.16421824031848012,"1036":-0.01680685485957846,"1037":0.01255556350689877,"1038":0.07245843477317822,"1039":-0.050376110399839115,"1040":-0.03869127399695953,"1041":-0.052178271206834215,"1042":0.15093493930751073,"1043":0.1522443904417442,"1044":-0.1536848145140121,"1045":-0.07268120222171796,"1046":-0.06882817926412647,"1047":0.20701043770281263,"1048":0.13653840706543852,"1049":0.11715967219523235,"1050":0.10904344321712911,"1051":0.0013163093451711043,"1052":-0.1322960728198889,"1053":0.010445612744005158,"1054":0.03867985302567626,"1055":0.11362784157756657,"1056":-0.027434444094150308,"1057":-0.15401300044018687,"1058":-0.14942905348688248,"1059":0.14657606582468774,"1060":-0.002009254600960941,"1061":0.046479210591483015,"1062":-0.04643357898875209,"1063":-0.10346809549647738,"1064":-0.08736246615488213,"1065":0.07744921116107364,"1066":-0.06562655339264503,"1067":-0.10957053394128662,"1068":-0.10449863868929768,"1069":-0.06254770833943,"1070":0.18322950329851986,"1071":0.0006439767548393845,"1072":0.11159016588164637,"1073":-0.08818724703286979,"1074":0.03294249352838739,"1075":-0.033090980852380485,"1076":-0.15087660736901407,"1077":-0.0885301396516021,"1078":0.12844323499421065,"1079":0.20522395080357936,"1080":0.17392774854935217,"1081":-0.12220010567620333,"1082":0.02175602584635839,"1083":-0.13674204940546264,"1084":0.09970293208377563,"1085":0.2098126943022276,"1086":0.007861594108335352,"1087":0.07316789694378624,"1088":-0.08180834477336563,"1089":0.2320205399762672,"1090":-0.0817160446401901,"1091":0.033670367499707136,"1092":0.1302476254488844,"1093":-0.16627080644871844,"1094":0.004129646751651043,"1095":0.06253854343529355,"1096":-0.12478306348012329,"1097":0.1202587585719605,"1098":-0.12041346817463197,"1099":-0.020569956519126794,"1100":-0.18038236943263844,"1101":0.07476688974498334,"1102":0.16611407688344532,"1103":-0.0802987899837368,"1104":0.20254508216569583,"1105":-0.007525001588488015,"1106":-0.14762668931335324,"1107":0.020350520652252933,"1108":0.1485619841323768,"1109":0.06603841725316258,"1110":-0.025878453895427464,"1111":-0.028326660103062586,"1112":-0.18606294784481325,"1113":0.193012310835403,"1114":-0.13852649674549394,"1115":-0.1050014026376241,"1116":0.10230196540656585,"1117":-0.028956017273532017,"1118":0.0371547985581212,"1119":-0.06813291778239021,"1120":0.049026952893744855,"1121":0.005263213746717816,"1122":-0.007056463514819155,"1123":-0.08179226322830707,"1124":0.1430267406620528,"1125":-0.1522616392193581,"1126":0.10255473882920582,"1127":-0.15949957211259405,"1128":0.02245362929483717,"1129":-0.07882031633865658,"1130":0.19435353667704294,"1131":0.14595959239422293,"1132":0.09703836588834423,"1133":0.16246649897720308,"1134":-0.0870427927016488,"1135":-0.12161568628322193,"1136":0.1793859451026109,"1137":0.029711533180843748,"1138":0.02396538317219851,"1139":-0.1363550454744794,"1140":-0.09165364823645172,"1141":-0.01856921507032662,"1142":-0.12319096914867898,"1143":-0.016154072438354018,"1144":-0.06607328999467244,"1145":-0.009184829091966697,"1146":-0.14371645738236882,"1147":-0.003247255789279916,"1148":-0.11626360179799654,"1149":-0.11187796901037984,"1150":0.11546713053004377,"1151":0.09661947770488945,"1152":-0.14513442358735776,"1153":0.19543866758065187,"1154":-0.0835605045665278,"1155":-0.09697705930985052,"1156":-0.13761396437950435,"1157":-0.12150079492294859,"1158":0.11282502509339112,"1159":0.028253686601921506,"1160":-0.1286005690857273,"1161":0.223412610036001,"1162":0.08903607018583032,"1163":0.12233371658332728,"1164":0.09958718272508438,"1165":-0.0545075966219099,"1166":-0.12936164605461772,"1167":-0.01323442403106038,"1168":0.1625089757082418,"1169":0.14718836003621133,"1170":-0.1596963663447893,"1171":-0.13222488820084205,"1172":0.19192278165730595,"1173":0.06600013710015469,"1174":-0.08728987523912492,"1175":0.19105316418406626}},"1":{"bias":0.19781820756447352,"weights":{"0":-0.12116544366086657,"1":-0.06293882627329259,"2":-0.04334128113037197,"3":-0.1813931825489814,"4":-0.03371627592942533,"5":-0.09705316568110613,"6":0.15640040033589947,"7":0.02847103939486152,"8":0.0619647623295122,"9":0.028144586699804998,"10":0.07763658764546487,"11":-0.11942561237293797,"12":0.08224449422953026,"13":0.1796632861239128,"14":0.18974035725180735,"15":-0.04265816425997194,"16":-0.007134385924312163,"17":0.036189031340731176,"18":0.03778635107060965,"19":-0.14002446902482604,"20":0.16494420049207634,"21":0.13309294147349177,"22":-0.11132661466603845,"23":-0.15199511441968208,"24":0.1290864556993557,"25":-0.020899763377553334,"26":0.21160080030088094,"27":0.06770765692616072,"28":-0.13694827675143498,"29":0.05086166776787916,"30":0.144045008661543,"31":0.08256471168165559,"32":0.19076778902022948,"33":0.09661361324488946,"34":-0.12846113644782226,"35":-0.0505836885155141,"36":0.08183077756092043,"37":0.11037709844863226,"38":0.1299790571706886,"39":-0.08472356071292073,"40":-0.17592798194568116,"41":0.03166419852504995,"42":-0.0936633246314401,"43":-0.10661459110828442,"44":-0.05631895545199633,"45":0.01227753674160002,"46":0.08286954768306329,"47":-0.028812974743494254,"48":0.17689274845059275,"49":-0.13052098226186049,"50":0.12678149444672596,"51":-0.03621521350519723,"52":-0.08583400062314835,"53":-0.09491573065738561,"54":0.04606769397364391,"55":0.008497969015231732,"56":0.0063532687521701756,"57":-0.17599245622599197,"58":0.17090151032268575,"59":0.13327626411952073,"60":-0.16516433535442746,"61":0.15761567011062774,"62":0.19182934204206104,"63":-0.16201095412191607,"64":-0.18101003664587986,"65":-0.0006367336314744866,"66":0.03623984460821597,"67":-0.08713866210925199,"68":-0.018350448139570957,"69":0.17365590059907127,"70":0.1406884755561727,"71":0.03958801244855844,"72":-0.1208378404780093,"73":0.11908269371184904,"74":0.09965648694470576,"75":0.012644448265117689,"76":-0.10366400569981901,"77":-0.20905988168055936,"78":0.06351540935012703,"79":-0.14253121301610322,"80":0.1537013436219377,"81":-0.1370646403902037,"82":0.09021802560990219,"83":0.045585483209060175,"84":-0.0018253757459846137,"85":0.0029114516085095143,"86":0.013323632354422781,"87":0.07093986010745466,"88":-0.18271155354195945,"89":-0.1760907968471024,"90":-0.015885575887066013,"91":-0.04326274414300629,"92":-0.07233245168792624,"93":0.1503201039101676,"94":0.08070470530832387,"95":-0.08211520323916963,"96":-0.14181091614658378,"97":-0.1544448981465627,"98":0.026895675148099787,"99":0.035704873694261875,"100":0.00003806140850729631,"101":0.008474543602554004,"102":0.2505357723725112,"103":0.09944238798232678,"104":0.10903790264189063,"105":-0.0987231206376652,"106":-0.14047835127568126,"107":0.009123472577812432,"108":-0.07018910803175119,"109":0.0884384520489603,"110":0.03722893509118962,"111":0.10752789483872348,"112":0.17513150723993567,"113":-0.05446337432570278,"114":0.16000067269395973,"115":0.05963358216650257,"116":-0.16472757110269262,"117":0.07331704805995516,"118":-0.145643654227507,"119":0.030955275999386595,"120":0.09046910475800464,"121":-0.04641767571723206,"122":-0.012941133226402016,"123":-0.03764306928207403,"124":0.0029371181422626668,"125":-0.09224534644736722,"126":-0.16620224402740358,"127":-0.04776210684670805,"128":-0.147394964159401,"129":0.012446632842214636,"130":-0.025361844677918098,"131":-0.1990027669312054,"132":0.02003982887717567,"133":0.1634786090133719,"134":0.01695408996949717,"135":-0.12619725823882244,"136":-0.07387822402476818,"137":0.10817502794909392,"138":0.12977450392053985,"139":0.1001629099579493,"140":-0.11959078009638435,"141":-0.14291688664262672,"142":0.01550233926626235,"143":-0.12324320990317482,"144":-0.019856956664489757,"145":-0.15108648862514698,"146":-0.16929722840450379,"147":0.1971470792988074,"148":0.012034281552118494,"149":-0.005164559921344915,"150":0.017293796047157327,"151":0.09339521391870852,"152":0.06313615934907861,"153":0.0219495490443568,"154":0.06858931690387396,"155":-0.06378201350831153,"156":0.01742302430314653,"157":0.02649754505197763,"158":-0.18969784966459602,"159":-0.173746979523738,"160":0.14560506593379213,"161":0.021626715502560397,"162":0.05793516806527646,"163":0.15144224045876256,"164":0.10712222231376173,"165":-0.1727852522318499,"166":0.01117298867835041,"167":-0.05085284582306832,"168":-0.15530783063489995,"169":0.059733900335917293,"170":0.16430036336624815,"171":-0.14527865640969526,"172":-0.19018606888450254,"173":-0.009638218469668896,"174":-0.087114789238799,"175":0.2137777107065784,"176":0.131964738282403,"177":0.013860451259097245,"178":-0.05664983289775052,"179":0.16227448754857485,"180":0.049350998678336304,"181":0.24906726934618306,"182":-0.15916498532866938,"183":0.01400648138476416,"184":0.00920939760303712,"185":-0.16872739750887356,"186":0.04492356338076024,"187":0.10332625073650503,"188":0.1253521150986606,"189":-0.048127835625676824,"190":-0.09301071024679364,"191":-0.17033692563294003,"192":0.04128562789842428,"193":-0.06227458478298009,"194":-0.05335391961847014,"195":0.02876673039921813,"196":-0.223756188857532,"197":0.1245890095699206,"198":-0.024208758497810966,"199":-0.10048496078069595,"200":0.24153403646045304,"201":0.16890619624574993,"202":0.07387312371647353,"203":0.10684706257450399,"204":0.07881129377230796,"205":0.20138209331204918,"206":0.10774822019647948,"207":-0.15582647209271233,"208":-0.11428431843037097,"209":-0.11243262125897711,"210":0.043591407659740754,"211":0.14970100804725092,"212":0.007286856967546135,"213":0.021685445110396724,"214":0.15100861762278803,"215":-0.128068167539804,"216":0.027734871118899742,"217":-0.05492475699603024,"218":0.05559412234441922,"219":-0.16145112969652417,"220":-0.02881998561306056,"221":0.09442765446462544,"222":-0.1717603025439097,"223":-0.1372770020549063,"224":0.03931818395686216,"225":-0.07640093580349538,"226":-0.052477708685066383,"227":0.0906509306385395,"228":-0.00985815717158055,"229":-0.11597194901166315,"230":-0.07310321982849668,"231":-0.0695794246088471,"232":-0.036715361355998385,"233":-0.1830530123449322,"234":-0.1311057490777831,"235":-0.1344831837286253,"236":0.1366192542128092,"237":-0.14016391815104073,"238":-0.07480701827959757,"239":0.010362032855607045,"240":0.07286472969098713,"241":0.16850183355299103,"242":0.04297815663526395,"243":0.18921141513185313,"244":-0.16629599034177558,"245":0.07856551212027144,"246":0.13884344083368447,"247":0.1434204074806155,"248":-0.17516531059495088,"249":0.0357385743022902,"250":0.240704550201162,"251":-0.0028517438359786087,"252":0.0747804378943032,"253":-0.015198339810187882,"254":0.19876823031827057,"255":-0.19185188427740552,"256":0.0014427986232519662,"257":0.018950655017068965,"258":-0.04089013866153649,"259":-0.04331889841819747,"260":0.047837679406157706,"261":-0.009003154841502383,"262":-0.01586467571226115,"263":0.11015477386499621,"264":0.151847304693142,"265":-0.11295013181679972,"266":0.12414502027725316,"267":0.02967775462322363,"268":-0.061377381103665314,"269":0.048481904128795224,"270":-0.1652128476657014,"271":-0.1762492638023191,"272":-0.20920178266910713,"273":-0.1541076189853182,"274":0.19027035833391884,"275":0.14118434290945148,"276":-0.0963020678029629,"277":-0.020832501495181267,"278":0.13687896796532872,"279":0.17687055261572326,"280":0.11769089454340968,"281":-0.04720922025400763,"282":-0.09204996939345912,"283":-0.18823878827085364,"284":0.15156497181414838,"285":-0.09229702494197921,"286":-0.03508776949829541,"287":-0.02141291747987406,"288":0.1169485660751197,"289":-0.2181156796715095,"290":-0.0047726606528407135,"291":0.14681116073285605,"292":0.060911808102891145,"293":0.14353843160974686,"294":0.11088791326995537,"295":-0.19019364420223037,"296":0.04309112754399194,"297":-0.11249852818177843,"298":-0.0114189035857823,"299":-0.1316150906818903,"300":-0.03325601607453483,"301":0.10309333298446316,"302":0.1734487026333472,"303":0.1454408740790705,"304":0.1675264783120023,"305":-0.19658899030679486,"306":-0.21427767175014376,"307":-0.044683203136005,"308":-0.18427754536295185,"309":0.08308647411177501,"310":0.089008921377983,"311":0.03861753728723616,"312":-0.09069698095631253,"313":0.02274829327455583,"314":0.0012065846168867866,"315":0.047898551316180094,"316":-0.1394623425544126,"317":0.07897100786406998,"318":-0.05036930938036159,"319":0.032649800645463335,"320":0.017320928978233313,"321":0.06326290846542271,"322":0.031002825091335458,"323":-0.14394008392795613,"324":0.02368202860440285,"325":-0.1707669115109685,"326":0.03380317993520318,"327":0.14411164979862406,"328":-0.0657008506066572,"329":-0.05215162405695211,"330":-0.015069085715090375,"331":0.06802650551191221,"332":-0.001341198489853339,"333":-0.010894644554552359,"334":0.17622040223829735,"335":-0.16622708649674225,"336":-0.15718417559886977,"337":0.00504312164429824,"338":-0.18084671698385207,"339":-0.19012325894156953,"340":0.03989807738187022,"341":-0.19367821863799398,"342":-0.20281001407751045,"343":0.22428427197345852,"344":0.08567893519382183,"345":-0.09093981624154594,"346":-0.18890137562058154,"347":-0.12634995861919052,"348":0.1933682616283661,"349":0.09294702967406446,"350":-0.17585004194497791,"351":0.01122375133764458,"352":0.18305363061441404,"353":0.12984068989034206,"354":0.09909096787848641,"355":-0.04679269721230958,"356":-0.18213237531866872,"357":0.11095758351577921,"358":0.14478355067659893,"359":-0.07264984965587121,"360":-0.08575507933109854,"361":0.2610607655973356,"362":0.022155655607777006,"363":-0.23454123753248085,"364":0.019175209657444712,"365":-0.13363098050988634,"366":-0.20843175665730046,"367":-0.07150589013075578,"368":0.09977283213147532,"369":-0.04920841901979734,"370":-0.17981923598268215,"371":0.18367714416758651,"372":0.19909759549541398,"373":0.15173036338228527,"374":0.0332157415484165,"375":0.04134553778452797,"376":-0.11855792843134104,"377":-0.1413570419027022,"378":0.030993480445083276,"379":-0.16014305450700864,"380":-0.06747829269240722,"381":0.15479865871279877,"382":0.07794416415263525,"383":-0.15862932194331786,"384":-0.19200622408136137,"385":-0.09597279628220745,"386":0.20554036702430714,"387":-0.13449422283440038,"388":-0.08757813186833417,"389":-0.11236503588033629,"390":-0.10124058096778552,"391":0.04637017278302854,"392":0.09117152274816807,"393":-0.10449144639960424,"394":0.006049072946312294,"395":-0.18252336212469625,"396":-0.11461680595900152,"397":0.13809493454825883,"398":0.02495348962196156,"399":0.14354265239070815,"400":0.04569195150568687,"401":0.05084374367342926,"402":0.09146443125152294,"403":0.10099780675082382,"404":0.11689447855974529,"405":0.10370378950143659,"406":-0.18583397847012456,"407":0.12322098384079948,"408":-0.1914721958105,"409":0.02303919085861906,"410":-0.08854920199764911,"411":-0.07575162289235415,"412":-0.056729060158665315,"413":-0.11994017895192943,"414":-0.14299304988242487,"415":-0.20563023413816586,"416":0.013682125641280258,"417":-0.0322305407451678,"418":-0.1102933018141141,"419":-0.11235026517452232,"420":0.1407003016796259,"421":0.18884457166277185,"422":0.17346847962952924,"423":0.14516591471969964,"424":-0.15068423677984813,"425":-0.0471637307800808,"426":-0.0178185511515124,"427":-0.08684234811034136,"428":-0.0714488948319352,"429":-0.029840127606427565,"430":-0.1482327846665377,"431":-0.07426175191211344,"432":0.06124192617262295,"433":0.11095263015347294,"434":-0.0557187727819431,"435":-0.04301759780142173,"436":-0.03251515527891331,"437":0.18721650921364516,"438":0.02089349354770957,"439":-0.21561755750172867,"440":-0.181779217427584,"441":-0.16211097759354634,"442":-0.10698169889369032,"443":0.1167491501121164,"444":-0.19813641291125633,"445":0.16830754375794563,"446":-0.0832564188520239,"447":-0.039280648877873664,"448":-0.08850388976960585,"449":-0.21286148029281426,"450":0.04011258662406253,"451":0.1295893672525844,"452":0.0002560348191389625,"453":-0.12472849695765316,"454":0.19706730711623827,"455":0.07493980257589629,"456":0.07732973724345577,"457":0.15677436602630426,"458":-0.06292349889024486,"459":-0.17518447347266833,"460":-0.04999714810755331,"461":-0.1267194186748774,"462":-0.01653507902497914,"463":-0.1441807012576591,"464":0.09380165007581663,"465":-0.14681855936820473,"466":0.08299962357191915,"467":-0.13844263268978665,"468":-0.029695194885100456,"469":-0.20285709566947457,"470":-0.03793295298119766,"471":0.12576306934850243,"472":0.15609950743292186,"473":-0.17032900577966875,"474":-0.011125822082424242,"475":-0.08460409874764839,"476":-0.09603024598637579,"477":0.09204091661034677,"478":0.19555640456954682,"479":-0.17297827278966882,"480":0.16815869013460527,"481":-0.18798253831752562,"482":0.12635090632855336,"483":0.007640931184610147,"484":0.11013072983066556,"485":-0.08406380876449651,"486":-0.18078245234970217,"487":0.09507094350912486,"488":0.01631983647804645,"489":-0.009712524549449807,"490":0.006810423251837971,"491":0.1804053015734505,"492":-0.14012885268198896,"493":-0.0964262342264016,"494":0.06762947605625019,"495":-0.09302945490404316,"496":0.07852164818267643,"497":0.03963916384962262,"498":0.014956782568866043,"499":0.09534450877294896,"500":-0.15007941248333187,"501":-0.19493249268383384,"502":-0.13210323147597783,"503":0.19740487327404374,"504":-0.15698186886309493,"505":-0.12455760620178505,"506":-0.18163848443535602,"507":0.07147984089366562,"508":-0.1312864754074716,"509":0.1940815371567512,"510":-0.13974590519583566,"511":-0.15525866122531445,"512":-0.09496926290911968,"513":-0.009974937819813628,"514":-0.0928263486960308,"515":-0.16769577207566244,"516":0.1080566112581289,"517":-0.13048405172613048,"518":-0.14139374993924692,"519":0.06587770501427166,"520":-0.09910546986370689,"521":0.1735844535548218,"522":0.0357334247836171,"523":-0.031636325057925525,"524":-0.11320311416918237,"525":0.08718634158015083,"526":0.1311869830995959,"527":-0.0076889879181720735,"528":0.19732315222406294,"529":0.01615377384855693,"530":0.07429342482134847,"531":-0.01668339634880514,"532":-0.05866501596364387,"533":0.19944774875176466,"534":0.16153949211381716,"535":0.1498724090936507,"536":-0.08514670012040186,"537":-0.1283306554604163,"538":-0.1309718743292466,"539":0.030078599056513666,"540":-0.11342589828141941,"541":0.04449848775295353,"542":-0.08757469115326222,"543":0.15310355784059718,"544":0.04175719007294017,"545":-0.01986457640875528,"546":0.08927572771232134,"547":-0.02786228357957249,"548":-0.1675093612283817,"549":-0.1176645301681755,"550":0.05884811745068475,"551":0.10504733220518203,"552":0.10021119268284802,"553":0.03577983278818767,"554":-0.09004002572259368,"555":-0.15106253452138302,"556":0.1807372215455012,"557":-0.05239125792148605,"558":-0.018274280046069333,"559":-0.15947870627079894,"560":-0.13410085813818257,"561":-0.08062281404507252,"562":-0.06987539796650635,"563":0.09241865083238632,"564":0.07154938748521839,"565":-0.00025777246196553416,"566":0.06970784666109976,"567":-0.06017339795421275,"568":-0.05248077870528671,"569":-0.03847121376541472,"570":0.002049007237079728,"571":-0.19436468887483085,"572":-0.18182419224414356,"573":0.03175328604350958,"574":0.11145861803008103,"575":-0.18286975095654964,"576":0.13702484012331556,"577":-0.11443923085686776,"578":-0.02564628161865251,"579":0.019165231358643717,"580":0.0702464765995093,"581":0.1758207722656528,"582":-0.0796809300504551,"583":0.06585491428954889,"584":0.12264704576300599,"585":0.09775376610282015,"586":-0.11211837449980845,"587":0.08016136208434871,"588":-0.21024879997656426,"589":0.1913627093042569,"590":-0.1108911147323965,"591":-0.1836902742723211,"592":-0.10117346597659013,"593":-0.045448200335626104,"594":0.018781639454244776,"595":0.05829522291860697,"596":-0.11671777959255844,"597":-0.11476949935066713,"598":-0.1200866158935897,"599":-0.058531349623714736,"600":0.1522909333266099,"601":-0.12936876610709458,"602":-0.0681421611810729,"603":-0.030187961538445014,"604":0.1418887029273351,"605":-0.04217764297581833,"606":-0.11777426903557014,"607":-0.18377759305407804,"608":0.04049347435966285,"609":0.047374161274231025,"610":-0.018245169839118874,"611":-0.11538208655091346,"612":0.13851883765101639,"613":0.13416324926524928,"614":0.07669584365372217,"615":0.15035931929484952,"616":-0.0024398666382918306,"617":-0.07844397548397014,"618":-0.10275542740419263,"619":0.02857136249359052,"620":0.12158802835611926,"621":0.09976555715996047,"622":-0.13728944461624668,"623":-0.0018964513315874374,"624":0.03194422442404602,"625":-0.0813603443497399,"626":0.04779140739468978,"627":-0.2130842567823174,"628":0.07300330304327698,"629":0.08475085583655882,"630":-0.13654608509104152,"631":-0.010385485401343047,"632":0.18298562191224865,"633":-0.08339361132150998,"634":0.0014780808561075936,"635":0.05068970852641212,"636":0.16438361467755483,"637":0.1144203155207443,"638":-0.22599415669925713,"639":0.024808438803380746,"640":-0.19582943991762009,"641":0.09456388722207928,"642":-0.02520361015270706,"643":0.19060222661238985,"644":0.11649318677107146,"645":-0.1008702706590242,"646":-0.18633269333296737,"647":-0.012385217308435068,"648":-0.15531571021426158,"649":0.15749922096666613,"650":-0.008811417427808327,"651":-0.12436755674258208,"652":-0.13606704194479327,"653":-0.008092972107419655,"654":-0.000059263145041049014,"655":0.15366824830625972,"656":-0.010751471988598243,"657":0.16083724862906046,"658":0.029979825594837684,"659":0.08105444685646564,"660":-0.1231371860506447,"661":-0.15843333171907634,"662":0.1092001238347081,"663":0.09564086446655921,"664":0.05298190511759654,"665":-0.1969090848150572,"666":0.20481368093937707,"667":-0.11509799013700733,"668":-0.15374692045263919,"669":-0.1366806274408562,"670":0.14339512663741166,"671":0.03976346901504807,"672":0.02648114652477178,"673":0.17688820408640657,"674":-0.15401944437214524,"675":0.0005834936603587604,"676":-0.18468956858971985,"677":0.17807968644960556,"678":0.005577950478327768,"679":-0.08956508689935089,"680":0.0031447324699858826,"681":0.11396673022600974,"682":-0.19772606495143893,"683":-0.11094688444184976,"684":0.13337297479181778,"685":0.1783814440141804,"686":0.1715998167098308,"687":-0.021381638457170116,"688":0.160102140701898,"689":-0.14517711815587417,"690":0.17297788042593407,"691":0.1642146911585692,"692":0.07466688817208979,"693":-0.21326239030028749,"694":0.009902556972438789,"695":0.197265769975187,"696":0.12405201537014163,"697":0.01473926233850492,"698":-0.006959330715982238,"699":-0.08613204259324271,"700":0.14826286732801688,"701":0.06421808656812664,"702":0.09369565698517947,"703":0.06987944286362054,"704":0.0207960187656635,"705":-0.1767190632651222,"706":-0.10576299948279527,"707":0.1277411463522483,"708":0.08195619391339984,"709":-0.16593325669224188,"710":-0.009362948007913112,"711":-0.15504306420222932,"712":0.20741467505577912,"713":-0.01876924232676576,"714":-0.12746737708255407,"715":0.04719372548469232,"716":0.033830844697337645,"717":-0.048736107630706446,"718":-0.023996869040092704,"719":0.06180275284290005,"720":-0.05255774341315532,"721":-0.0641690824029114,"722":-0.17195303040071677,"723":-0.06196790897906273,"724":0.10396567572767579,"725":-0.16498490657562964,"726":0.16436234162607413,"727":0.06082356087163103,"728":-0.04405888461957504,"729":-0.0800436590749605,"730":-0.0903059742654964,"731":-0.05820085839831746,"732":-0.07529118478045979,"733":0.12226452028602545,"734":0.1412725136042698,"735":0.04977840762189391,"736":-0.01674965289782109,"737":-0.11054436615287151,"738":-0.10151012430123783,"739":0.03449767301443054,"740":-0.14955819163924874,"741":-0.037322502184111886,"742":0.007406979435372097,"743":0.1478529275419432,"744":0.1083452400575198,"745":-0.10559970751671086,"746":0.04656024201100478,"747":0.041572776848234266,"748":0.03307907166145075,"749":0.00046807806766338924,"750":-0.12292446554588907,"751":-0.014928842808491962,"752":-0.1915257051152105,"753":-0.14658031199638905,"754":-0.08271996876924405,"755":0.005482039878534974,"756":-0.13489506147951494,"757":-0.18981322063546865,"758":-0.1777323095241902,"759":-0.043697479682138704,"760":-0.21142792169756924,"761":-0.09079653927608321,"762":0.037139825752106136,"763":-0.13750094910504593,"764":0.006582060257760625,"765":0.02383856935404538,"766":0.13113863002488355,"767":-0.12000299303473602,"768":0.05058405310832111,"769":0.03836977817228283,"770":0.16830114370724825,"771":-0.05377993200352201,"772":-0.10228077493668608,"773":-0.10352155383069185,"774":0.12779233502761084,"775":-0.04917403504031889,"776":0.1229844820728193,"777":0.10446561675443733,"778":-0.1545701322762942,"779":0.14836549260250428,"780":-0.03183552363868139,"781":0.10094096470130744,"782":-0.054618086051707954,"783":-0.053237320862067734,"784":0.025240146306638945,"785":0.038910050307625774,"786":-0.143232476800048,"787":0.2064933483678068,"788":0.1680176550848848,"789":-0.06751620982175642,"790":0.11961074655865946,"791":-0.05564850737538575,"792":-0.010985042666862479,"793":0.11742990212303857,"794":0.040292745520256155,"795":-0.16170263995518588,"796":0.021226836220851253,"797":-0.09107844112136315,"798":0.14868491944849213,"799":-0.09316576242318893,"800":0.16445743335116464,"801":-0.20898702127562682,"802":-0.0029088117284346493,"803":-0.05816651675763275,"804":-0.11953158652416887,"805":-0.0015195835801950133,"806":-0.006899403951133479,"807":-0.2168295086950962,"808":-0.05951880948303741,"809":0.11652164301411985,"810":0.11842863653655088,"811":-0.004345898333456096,"812":-0.06242635649293864,"813":0.07539698072442007,"814":-0.20986981404074467,"815":-0.007917698323612478,"816":-0.13651196291916803,"817":0.04026472179323614,"818":0.0842163558540158,"819":-0.1183271225343516,"820":-0.11678521451086964,"821":-0.1870225893467649,"822":0.06023361214945259,"823":-0.09096408526378039,"824":-0.16725302790180274,"825":0.0897199090958575,"826":0.0041630300181578015,"827":-0.0514749026800267,"828":0.030712025577913867,"829":0.006620998995283009,"830":0.16668124282722308,"831":-0.04558402459843813,"832":0.1355338441352678,"833":-0.10399310636474411,"834":-0.12733912626223814,"835":-0.050845276093539594,"836":-0.012048670411761095,"837":0.15794756496867488,"838":-0.0935227178641409,"839":-0.18291222306305438,"840":-0.006775839237823923,"841":0.1246617859775517,"842":-0.011129452616889952,"843":0.014674855767219002,"844":0.014320871518403604,"845":0.010804823699965872,"846":-0.0827421016160427,"847":-0.010797742847818054,"848":-0.0863237101451618,"849":-0.039330051449589835,"850":-0.11886872168136643,"851":-0.15645382249981996,"852":-0.08068058737063319,"853":-0.00032662493053104975,"854":-0.19613332957627025,"855":-0.11592343540189044,"856":0.06301153571901752,"857":0.03382802531133521,"858":-0.16137064917807997,"859":-0.015424244430228282,"860":0.1110030189188807,"861":0.14945666914867275,"862":0.18232308540564657,"863":-0.12668769262269852,"864":0.04408723792557105,"865":-0.022002610370062924,"866":0.12678407366297134,"867":-0.030017931504808783,"868":0.19168577016760482,"869":0.21912090305442794,"870":-0.18586616177703014,"871":-0.039996071313750506,"872":0.12701916778723665,"873":0.12397448560086066,"874":-0.19461106360942015,"875":0.04678529681226196,"876":0.07087781143080314,"877":0.13497585154677447,"878":0.032409031543878586,"879":-0.1597417455550913,"880":0.07463903171135453,"881":-0.09195494493392845,"882":0.13498452309747025,"883":0.045512320505659745,"884":0.05368184393111312,"885":0.1612239013443332,"886":0.061359578124285455,"887":-0.16005702916704204,"888":0.15094805717801082,"889":0.1083096203724669,"890":0.1683552953407588,"891":-0.15457653782582073,"892":0.17766172597166885,"893":0.12403986741208009,"894":0.05464729979997785,"895":0.17216655535346118,"896":0.004924204023872626,"897":-0.0021744879816169137,"898":-0.2076067054495215,"899":-0.09730552154731116,"900":-0.0517360712107485,"901":0.12303384400412416,"902":-0.051197473477503704,"903":-0.0944764976389708,"904":-0.037396361128729745,"905":0.09339645814740377,"906":0.008197652319817469,"907":0.015494036176468134,"908":-0.11829289512180888,"909":0.07266327666374563,"910":0.016947610425720867,"911":0.09538154884430383,"912":-0.07791628213570849,"913":-0.0779402489403461,"914":0.1298499055172858,"915":-0.056216112032112804,"916":-0.07742841354947926,"917":0.04888855636844978,"918":0.12489218717250847,"919":0.05812903762094863,"920":-0.21122556078264357,"921":-0.057748423104799176,"922":-0.20461401020337833,"923":-0.03314559634687305,"924":-0.027027447142908584,"925":-0.14571644994130026,"926":0.04195927630340111,"927":0.19704671610721217,"928":-0.14183519856491267,"929":-0.1501217892897331,"930":0.21521114545776301,"931":-0.10118842177832073,"932":0.005893650242475902,"933":-0.08249692189313318,"934":0.11824184636968085,"935":0.11922926907046734,"936":-0.2101884425009744,"937":0.0555493360769226,"938":0.09047328549022068,"939":-0.25376383111146167,"940":-0.12359426953228576,"941":-0.18787856372265035,"942":-0.0726753404764455,"943":0.017874892483420005,"944":0.20085778305037144,"945":-0.18456700921831146,"946":0.05228737195217992,"947":0.09468412009860792,"948":-0.07022493047348864,"949":-0.011667257455509117,"950":-0.09712481480779313,"951":-0.03613135912750903,"952":-0.1823851005984808,"953":-0.17149107387443666,"954":0.24014836482396257,"955":0.0667248275838052,"956":-0.09376814500900461,"957":0.11639132403933862,"958":-0.08181987828181193,"959":0.08934832280873423,"960":-0.032972994518164836,"961":0.005640955931624774,"962":-0.09329167882094076,"963":-0.1152946368505429,"964":0.03623117226700064,"965":-0.09174368026722804,"966":0.11969276896950072,"967":-0.10371054098875243,"968":-0.1802102675585507,"969":-0.02845114565668988,"970":-0.09166940379391601,"971":0.10213434647980273,"972":0.027960967693201895,"973":-0.10659594186806591,"974":-0.1955680367181735,"975":-0.13017230469241065,"976":-0.11207966451779582,"977":-0.050407070105732116,"978":-0.10782779818927728,"979":-0.07281694792223972,"980":-0.1408249493395186,"981":-0.029623303121396095,"982":0.007036424340338961,"983":-0.07506000025881167,"984":-0.019881760855444238,"985":0.12206947604563792,"986":0.02385809146020006,"987":-0.11257240373583037,"988":-0.1619275599033669,"989":0.08569426567077697,"990":-0.15675245816957573,"991":0.002880736724000068,"992":0.10938316226091664,"993":0.17081496675354305,"994":-0.09603644597029741,"995":-0.131968674884179,"996":0.03799120079279061,"997":0.14960486013295618,"998":-0.006153202154409273,"999":-0.165917257384366,"1000":-0.20627738089024333,"1001":0.16846912407385672,"1002":-0.15612260919089074,"1003":-0.1080314097506289,"1004":0.08394129856301695,"1005":0.05506813574440204,"1006":0.08377466593271034,"1007":0.159342240891041,"1008":-0.12760673040635073,"1009":-0.17519156957093004,"1010":0.039753834459572805,"1011":-0.1657228342176359,"1012":-0.18906011949144136,"1013":0.15184977015844286,"1014":-0.15586262901898826,"1015":0.03536376066089403,"1016":-0.13006506057009967,"1017":-0.06871537344002468,"1018":-0.17190213424465814,"1019":0.10511345372988323,"1020":-0.10864148382170727,"1021":-0.029151058612860242,"1022":0.0561421310242849,"1023":-0.07706384562712891,"1024":0.01912001145629671,"1025":0.17069521187077227,"1026":-0.054262209859081555,"1027":0.047347659506117454,"1028":0.1025966864063072,"1029":0.15303597575225894,"1030":-0.11633203673645835,"1031":-0.12550490617958807,"1032":0.10916562761937411,"1033":0.08665117347266277,"1034":0.11441420929285964,"1035":0.03635070114522755,"1036":0.17181928133568042,"1037":0.02818554980565952,"1038":-0.018092495389749816,"1039":0.0850030217647135,"1040":-0.12877390020981475,"1041":0.12466850929036752,"1042":-0.15489051035891516,"1043":0.017439246745498436,"1044":-0.1190647274350313,"1045":-0.16736484273892735,"1046":-0.07813785736596698,"1047":-0.16023878549208562,"1048":-0.17178324775316922,"1049":-0.13340387455131758,"1050":-0.01691346363093839,"1051":-0.03537487429836453,"1052":0.14502333474290996,"1053":0.03344069997569861,"1054":0.015288386941585925,"1055":-0.14709058388138746,"1056":-0.15452749544859767,"1057":0.03315577616202613,"1058":0.0984128255404103,"1059":-0.055835695539756806,"1060":-0.036031778553521555,"1061":0.0680584300868498,"1062":-0.21056668714899202,"1063":-0.02759468413973109,"1064":-0.12734431762003803,"1065":0.055158264941361765,"1066":-0.12408135045325938,"1067":0.011309763073097967,"1068":0.20547099868790936,"1069":0.18479306627158826,"1070":0.06765473860816085,"1071":-0.17744731585600754,"1072":-0.045284240452622596,"1073":0.03903025969997144,"1074":-0.018346844509913505,"1075":-0.00005975281143953578,"1076":-0.08156450023421147,"1077":0.06138584861829286,"1078":-0.014670582160426559,"1079":-0.05110396291940879,"1080":-0.05741791551991387,"1081":0.1760842855758805,"1082":0.11308084292218007,"1083":0.013705069946025416,"1084":-0.05620383827359975,"1085":-0.01547308404563698,"1086":0.08365408977923446,"1087":0.00382135784944972,"1088":0.0032305662353807846,"1089":0.07624150897887702,"1090":-0.11411878982616741,"1091":-0.12123667918272732,"1092":0.1257489231626954,"1093":-0.021558656129129956,"1094":-0.1985670168784202,"1095":0.1863055350104963,"1096":0.0017568583665927998,"1097":0.1598446521413193,"1098":0.0015156733451482348,"1099":-0.002366724998470999,"1100":-0.009976554534400328,"1101":0.1160657884963972,"1102":0.053935853999483696,"1103":-0.06515018252147696,"1104":0.08240946644800662,"1105":0.04485119857523453,"1106":-0.04388144988319903,"1107":-0.16839728443983182,"1108":-0.06991126290422826,"1109":0.017777292693611252,"1110":-0.029020467057752478,"1111":-0.15904726247146928,"1112":0.18918482116606275,"1113":-0.10422520186553597,"1114":-0.1427034408969921,"1115":-0.16500584827731993,"1116":-0.05413403070693458,"1117":0.05392815285602747,"1118":0.13135560875360594,"1119":0.1723939787512251,"1120":0.1627330214365739,"1121":-0.043020701352195434,"1122":0.07967281701953544,"1123":0.19187507313332774,"1124":0.1501987464941304,"1125":0.016810547014167274,"1126":0.13558152234631352,"1127":0.17268580250031268,"1128":-0.148345104206974,"1129":-0.13136276404412933,"1130":0.10902757571711151,"1131":0.14445069233439203,"1132":-0.016547925648909997,"1133":0.00009700503610706823,"1134":-0.12184392632923213,"1135":0.15607695652941636,"1136":0.16868065840631571,"1137":-0.21536656741185192,"1138":-0.015656087670578318,"1139":-0.15225716707648054,"1140":0.1914028476559365,"1141":0.003845696575920575,"1142":-0.047401976784418,"1143":0.10161814143143492,"1144":0.1699933447593116,"1145":0.0440263721766474,"1146":0.0008323368681986292,"1147":0.14443335127036971,"1148":0.0827971258103416,"1149":0.11705354667005766,"1150":0.11998190172510954,"1151":-0.026945703647819886,"1152":0.06557050970466613,"1153":-0.026455696365818914,"1154":-0.017748730261423616,"1155":-0.10395960385531762,"1156":-0.185300379663596,"1157":-0.1521696120844936,"1158":-0.04985338828496538,"1159":-0.1762085345593526,"1160":0.029646868749615272,"1161":0.024151814274723116,"1162":-0.16204585549743963,"1163":0.1125974804219634,"1164":0.053622875635875686,"1165":0.1107673444110692,"1166":0.14633657680363646,"1167":0.002738112597136912,"1168":-0.07538199284760463,"1169":0.005528562769024439,"1170":0.11197419747769005,"1171":-0.12075491182303429,"1172":0.1789082282009806,"1173":-0.009791074818569837,"1174":0.17463840647533932,"1175":-0.10835779035272314}},"2":{"bias":0.003487606508038681,"weights":{"0":0.08376158581011423,"1":-0.016402423020702803,"2":-0.14863089934980758,"3":-0.1832455638274357,"4":0.16088024287332578,"5":0.028195386502283364,"6":0.1411377648893655,"7":-0.041333962041262884,"8":-0.16071325722736052,"9":0.1345069737637427,"10":-0.06697897133721249,"11":-0.11318537385840048,"12":0.23955187082858076,"13":0.007471773643266342,"14":0.12854082051767562,"15":-0.08386275486587627,"16":-0.01454159632289863,"17":0.008137366313794709,"18":-0.01343649482503914,"19":0.23095278588716625,"20":-0.12745332515591076,"21":-0.12736816309676627,"22":-0.03166570611030787,"23":0.1320316876066756,"24":-0.1634529767789926,"25":0.036835119764946356,"26":-0.1578126919567827,"27":-0.028912472993974765,"28":-0.20241300838996873,"29":0.09341590606304466,"30":0.154156122782677,"31":-0.07513754648334157,"32":-0.09510385735607962,"33":-0.14087621933221064,"34":-0.00022781816748727778,"35":-0.0025296126391761292,"36":-0.23849915966127855,"37":-0.11304475009896096,"38":0.2574265675809196,"39":0.01211004693032954,"40":-0.19287143294595863,"41":-0.03696903583793981,"42":-0.21511251485164046,"43":-0.20574072424435963,"44":0.16354347025342042,"45":-0.02906147566554967,"46":-0.015118542906390739,"47":-0.08395365102734464,"48":-0.048826378348176415,"49":0.18538451481221524,"50":-0.08527607069421818,"51":-0.1255190625770096,"52":0.04164932414318309,"53":0.0032589352231228363,"54":0.05557457277967007,"55":-0.04391192312152108,"56":-0.01160998010904007,"57":0.16360344594222842,"58":-0.1943057962989604,"59":0.11329552931974837,"60":-0.06084504884135308,"61":0.0033320217340879208,"62":-0.020310004552715494,"63":0.10196695570229045,"64":-0.0773585101152516,"65":-0.16939962898996774,"66":-0.23451048266358215,"67":-0.15584534856571433,"68":-0.029063163296123264,"69":-0.10804039804113368,"70":0.15951282877033868,"71":-0.15024256646683912,"72":-0.07834185323467599,"73":0.04599724613008483,"74":0.05679113625872774,"75":0.04876525802570408,"76":-0.08815386753469102,"77":-0.15335528734016876,"78":0.13366794986147282,"79":-0.03200387447892059,"80":0.03304715721587499,"81":-0.01664936982053297,"82":-0.1579702318887959,"83":-0.06962602657856777,"84":-0.06222814649597468,"85":-0.08130097369651508,"86":0.11735503529526081,"87":0.10941764964950743,"88":-0.03137166149568038,"89":0.009812341526276136,"90":-0.039732711386732344,"91":0.10569077843130553,"92":-0.15076068690674232,"93":-0.022546703708297568,"94":0.1716299744661108,"95":-0.03178958617577405,"96":-0.06952091661209893,"97":0.07070035071441416,"98":0.10745023728789298,"99":-0.11856443663720088,"100":0.08635398633743711,"101":-0.11590862220807395,"102":0.0028978023861169116,"103":0.09611175309656389,"104":0.07616796900555345,"105":-0.03449147888159122,"106":-0.04359747775564374,"107":-0.07130477323831479,"108":0.17481217865807092,"109":-0.15455384245343212,"110":-0.020528703017910363,"111":0.10750156142727421,"112":0.1922867041084865,"113":0.09573290429395999,"114":0.035633684546928175,"115":0.11308280338336331,"116":-0.03704131665970352,"117":-0.20293375300996191,"118":0.21670205895077443,"119":-0.06859571270985505,"120":-0.07822698536898404,"121":-0.1396719196448574,"122":0.15834103358203847,"123":0.025004416468220433,"124":-0.051612161463049616,"125":-0.046929223554456376,"126":-0.016277253437894112,"127":0.045087464646217566,"128":0.15613328330913998,"129":0.06099179916728059,"130":0.17292510024726598,"131":-0.08331659644087322,"132":0.009728439404691525,"133":0.10627363584551493,"134":-0.10677156961319084,"135":0.13486061425306783,"136":0.13682907558644933,"137":0.2264575942327122,"138":0.08391406408655872,"139":-0.1142497623427949,"140":-0.19031579930630269,"141":0.10169219163686756,"142":0.03273898974446572,"143":-0.10151501379007886,"144":0.17603846312061167,"145":0.1751628546968098,"146":0.16747576396908534,"147":-0.005983426473009795,"148":-0.1601067960617643,"149":0.07612449452791602,"150":0.07271651703240407,"151":0.138748105720806,"152":-0.19752722120372476,"153":0.15944916556603042,"154":-0.18332392117459934,"155":0.046693241292043754,"156":0.08595057309766044,"157":-0.024085233376335242,"158":-0.1401291644598241,"159":-0.22744495891331626,"160":-0.02210383905574308,"161":0.0727631952210727,"162":-0.052934900502095684,"163":0.18892205671007983,"164":-0.03065516732161987,"165":-0.20271564398816042,"166":-0.02683269787117085,"167":-0.1321675220510101,"168":0.025295314245275657,"169":0.23303248190268977,"170":-0.07016625286056034,"171":-0.1060368368132066,"172":0.09204093554835813,"173":-0.13126495640769334,"174":-0.041471490539330275,"175":0.09791497923813214,"176":0.2553687855456077,"177":-0.09450517857706615,"178":0.02368439192430008,"179":0.059103551907959025,"180":-0.13544540651086512,"181":0.12040884867350454,"182":0.10814048397133989,"183":-0.08935436051325889,"184":-0.1359085856977315,"185":-0.05955876314976062,"186":-0.18848493760289284,"187":0.21532434486243304,"188":-0.1740814548981941,"189":-0.013521987816094268,"190":-0.09154356845768556,"191":-0.16342219177829231,"192":-0.15003407419043224,"193":0.03145950773732556,"194":0.33364036836548794,"195":0.015551868068438637,"196":-0.19719572679151245,"197":-0.13188522730549848,"198":0.0827476838120912,"199":-0.08740169346244853,"200":0.02703471901209611,"201":0.13175419645636297,"202":0.013724731287801025,"203":0.0068083603530647435,"204":0.00800478343592761,"205":0.05796747495494666,"206":-0.13470623613292498,"207":0.09693031702145231,"208":0.12095606351179951,"209":-0.15774259113616956,"210":-0.12116762534335605,"211":0.12987219994325963,"212":-0.13969310616730118,"213":-0.1308497619520287,"214":0.0024076337464382608,"215":-0.04657637020434007,"216":-0.1393217856822829,"217":0.14097745824431837,"218":0.08255278545048743,"219":-0.05775592738328765,"220":0.05983301876688754,"221":-0.16667668864608798,"222":0.15258862385255412,"223":0.06580797745035122,"224":-0.05986073191100239,"225":-0.022517490304990295,"226":0.06054975503689356,"227":-0.1625426716795588,"228":0.03403751311026701,"229":0.04321387003909378,"230":-0.02493302539069576,"231":-0.13599748794772842,"232":0.009823112255777375,"233":0.01923484590132267,"234":-0.1302417696262839,"235":-0.1797734162868959,"236":0.1882936430924622,"237":0.052660678610570104,"238":0.010626208738744244,"239":0.01813406366110561,"240":-0.1466567163900977,"241":-0.19443740141439952,"242":0.036090429497945074,"243":-0.19381642992851286,"244":-0.15986435410087965,"245":0.13211567852329426,"246":-0.06346198095338133,"247":0.07939197396227368,"248":0.056229653095698315,"249":0.07139846871184694,"250":0.0035587727918811444,"251":-0.09254104309717115,"252":-0.2846161192738302,"253":-0.041694398050667825,"254":0.009199898983392789,"255":-0.1387809817687579,"256":-0.16380301038899409,"257":-0.040550397576859,"258":-0.04652452872148273,"259":-0.0651201772351832,"260":-0.15220781884268128,"261":-0.1562034526410879,"262":0.27753970303947584,"263":-0.1538879215652547,"264":0.04633894658504236,"265":0.04590321931266889,"266":-0.03760790332163758,"267":-0.022090636341109672,"268":0.0008848161786301727,"269":-0.01468211954739853,"270":-0.16351502653532654,"271":-0.04687529632786793,"272":0.0036299549200251072,"273":-0.07198871441925812,"274":0.0955908844076679,"275":-0.10874304284032929,"276":-0.1848326517165898,"277":0.009820697631939919,"278":0.019364746982453548,"279":-0.1828508404937108,"280":0.03970617985935975,"281":-0.03531116219351659,"282":0.0002271808755303316,"283":-0.13933993779739123,"284":0.08911313499747517,"285":0.01172951668964142,"286":0.16692193849166448,"287":0.017276834815228827,"288":-0.15596648343004854,"289":-0.22727808931790774,"290":0.09133924801749217,"291":0.0396653394108054,"292":0.1585799968246544,"293":-0.005608157788359238,"294":0.16405018116018447,"295":-0.16537670654126865,"296":0.15851635656303625,"297":-0.007087405610815146,"298":-0.0015469360663315668,"299":-0.06899100394168357,"300":0.08422128697378023,"301":0.035867451925953864,"302":-0.016833254783930014,"303":0.030141507055951144,"304":0.012659181902937149,"305":-0.2364885423419554,"306":0.08544036689482772,"307":0.01032151590087275,"308":-0.20676412599192934,"309":0.1352398822272323,"310":0.1571839380709546,"311":0.17003391239733956,"312":-0.07379975424247487,"313":0.0345145432525561,"314":-0.0783478594173242,"315":-0.10850108466977575,"316":-0.01679422855054719,"317":0.062813815449752,"318":-0.105263698281717,"319":0.21530873727662903,"320":-0.05657838281545164,"321":-0.10076116784102827,"322":0.09194144676918481,"323":-0.14268089867661776,"324":-0.08357221551766326,"325":-0.17201414079109814,"326":-0.08139088237781161,"327":-0.1565667028064852,"328":0.05779326619446418,"329":-0.16082583687418864,"330":-0.1594427236778458,"331":-0.04630824555238396,"332":-0.0472443945043619,"333":0.03287173751402958,"334":0.03335384473222651,"335":-0.0751456355348279,"336":-0.134981424277883,"337":0.09589648128173338,"338":0.19465694497441255,"339":-0.07354949603293055,"340":0.14977329204881545,"341":-0.08909162557401426,"342":-0.1826415980187129,"343":0.21811530672686988,"344":-0.06406268211082755,"345":0.08765300188548028,"346":0.09544306344916496,"347":-0.19703473334587016,"348":0.12770149083653248,"349":0.13108981102797612,"350":-0.20452804637396654,"351":0.1412590804100603,"352":-0.0484302891429114,"353":0.05085282957212125,"354":-0.04272080334648346,"355":-0.04816928795148348,"356":-0.01412008151780197,"357":-0.026254290447332462,"358":0.015947216363597985,"359":-0.05465389554428005,"360":-0.11125740919947502,"361":-0.01827677286221351,"362":0.09209277502947384,"363":-0.09766432539543422,"364":0.08777836343584854,"365":-0.015867917253524398,"366":-0.20507210910160042,"367":-0.13102032426600882,"368":-0.036521872174613196,"369":0.13477171562981677,"370":-0.23425147702807808,"371":-0.1132263601756643,"372":0.1890103721434273,"373":0.1715263119634955,"374":0.10010903847306252,"375":-0.029851670315678428,"376":0.12177488244808334,"377":-0.10266344940989787,"378":-0.22368929300530982,"379":0.1390410035719794,"380":0.05049381583334723,"381":-0.1910429827364165,"382":-0.1651621093294174,"383":0.01043872067773001,"384":-0.02117877543059358,"385":0.2232656985081484,"386":0.1430012517448542,"387":0.10044238608702544,"388":-0.12577645112124305,"389":0.10599796373722387,"390":-0.02407019107530531,"391":-0.12796489917040868,"392":0.14409146586597607,"393":-0.13130177437817875,"394":-0.10385776035807542,"395":-0.16871997786592122,"396":0.09804536635539379,"397":0.2128953254288135,"398":0.033553857084240475,"399":0.10179872528531557,"400":-0.14619797310009167,"401":-0.10067361980301102,"402":0.037021886397827816,"403":-0.12506050891303214,"404":0.03737649959998574,"405":-0.15509826922131748,"406":-0.02583003500827454,"407":-0.1081773203729843,"408":-0.21768976428445325,"409":0.14799123167239392,"410":0.05173053995781438,"411":0.07976850972531578,"412":0.12688652623466198,"413":-0.13698082122391025,"414":-0.08212059257042774,"415":0.15937756444478465,"416":-0.1556630161158155,"417":0.004804564517805701,"418":0.09606043523925531,"419":0.08596028080803261,"420":-0.22264639144207868,"421":-0.019930094680760554,"422":0.0005957348876715587,"423":-0.03285196209280379,"424":0.029408664435555548,"425":-0.09030385577180763,"426":0.08137589705214816,"427":0.06013475932349814,"428":0.002353071993201108,"429":-0.10530707004591157,"430":0.17438246860651796,"431":-0.12696492650700947,"432":-0.21702668758394572,"433":-0.23644533036127954,"434":0.16383899809278582,"435":-0.05123449703183431,"436":0.1164751417954846,"437":-0.15927722795953123,"438":0.08841469620533544,"439":0.12635640039474075,"440":-0.0605169687816391,"441":0.11874355293878663,"442":0.1877220395262082,"443":0.07857890430338224,"444":0.06365226489969204,"445":0.05005939190799075,"446":0.0741949266033757,"447":-0.13014526896473155,"448":0.1651604274923446,"449":-0.00020889893552667921,"450":-0.10188351941559735,"451":-0.07919474045924504,"452":-0.035536199811466176,"453":0.13287883702633238,"454":0.1355919644926244,"455":-0.22615763903007652,"456":0.13805986141394655,"457":0.010530449891178266,"458":-0.003605274262815028,"459":-0.03315874207066866,"460":0.18960240348119112,"461":0.11994418832783005,"462":-0.19860826268127335,"463":-0.05983714474876718,"464":0.0636377110189758,"465":0.024693564069903095,"466":0.08170416188102975,"467":-0.0524113309713257,"468":-0.18535492877993703,"469":-0.059040914464705795,"470":-0.21020651046181624,"471":-0.2363372257854538,"472":-0.07919312411269577,"473":0.1458244651376089,"474":-0.117061439873421,"475":-0.22620312337906892,"476":-0.08883433791023294,"477":-0.13826814149773786,"478":-0.08276884399127744,"479":-0.1665173920913446,"480":-0.17417944274034816,"481":0.08392088456985995,"482":0.12237846769166316,"483":0.10335711401512429,"484":-0.06184820175545159,"485":-0.0020689392983902813,"486":0.09553137636059887,"487":-0.041645663633275896,"488":-0.10254396142744326,"489":-0.18071171143004713,"490":0.10386801623268495,"491":-0.1429081705024228,"492":-0.004696851305154467,"493":-0.13372672268096056,"494":-0.19869148835397554,"495":0.04826686750993419,"496":0.021526887928567825,"497":-0.07929856169872623,"498":-0.18248874658178832,"499":-0.18628264916276502,"500":0.0227923346048136,"501":0.14021798535946645,"502":-0.08307883737777455,"503":0.0017729392465060027,"504":0.010303030252751037,"505":0.1837288489479686,"506":-0.10055699659726476,"507":-0.2136969026956372,"508":0.06904587185816709,"509":0.1993369368941393,"510":-0.1891313963508353,"511":-0.10972684384284616,"512":-0.09448960516984452,"513":-0.17821325406158572,"514":-0.1725692538843358,"515":-0.02366151394884223,"516":-0.00437445342900016,"517":-0.09987130059191093,"518":0.14525988714116142,"519":-0.022708324810331654,"520":-0.18202882923078267,"521":0.1310518361101659,"522":-0.10221380859939465,"523":0.02746630600929804,"524":0.11488738594944924,"525":-0.1626839049386525,"526":0.1633503954478411,"527":0.10995512615551296,"528":0.1295065589815841,"529":-0.08899515921831525,"530":0.17848800684105293,"531":0.0846681804443705,"532":0.06773084042313447,"533":-0.13679604896568082,"534":-0.10942697877364632,"535":-0.17520779027495334,"536":0.08481284253741452,"537":0.038741537768538385,"538":-0.1599113402810234,"539":-0.14220573150510482,"540":-0.09511383096325504,"541":0.14616926225151217,"542":-0.1725645753051182,"543":-0.052694722032058904,"544":-0.14027541142607622,"545":-0.11600787242847528,"546":-0.1892076338226756,"547":0.04882553099794939,"548":-0.1537331364134733,"549":-0.14166876494861466,"550":-0.22479666994283748,"551":-0.06248877405626105,"552":0.13926779445958087,"553":-0.07540632139742015,"554":-0.1300558572318603,"555":-0.1356409385470417,"556":0.033008340055632454,"557":0.20977696283043876,"558":0.08528184932710421,"559":-0.13612384336141853,"560":-0.0674700027482,"561":0.14726778134236806,"562":-0.13761311254760175,"563":-0.07828353033466533,"564":0.005317565914587316,"565":-0.1037708109388155,"566":0.18203379157317434,"567":0.0018219880443581268,"568":-0.17582021951836665,"569":0.08640828054337489,"570":-0.06745558109710503,"571":-0.15484820558157938,"572":0.12596394981571574,"573":-0.11166246952146484,"574":0.18992025419291786,"575":-0.06135805945512891,"576":0.10085600177092711,"577":-0.0421093837872454,"578":0.00828426065566796,"579":0.02691904978545613,"580":-0.10632310409438045,"581":0.12107606381259521,"582":-0.11942361017298041,"583":0.16507933859443052,"584":-0.18334596588841243,"585":-0.14825131155180243,"586":-0.059964512325797255,"587":-0.10407967296101685,"588":-0.1382462738817471,"589":0.14792651106699492,"590":0.1320423632758869,"591":-0.04741425861439455,"592":-0.05693305840875082,"593":0.08159269706057909,"594":0.0822112176686223,"595":-0.020488475836709884,"596":-0.06503557957891377,"597":-0.07739964888180129,"598":-0.11841442491432969,"599":-0.08169959920622452,"600":0.09849623000335817,"601":0.06738363489610902,"602":0.061938764924009675,"603":-0.20587372247684638,"604":-0.17708706456436016,"605":-0.21414812237550349,"606":0.094096360521861,"607":-0.09814940140556827,"608":-0.2150228771529006,"609":-0.10169258487985017,"610":0.15604614750871507,"611":0.11214938177491149,"612":0.044891097721027604,"613":0.07317933131195285,"614":0.08208932027074993,"615":-0.06608425225959819,"616":0.11560207688082896,"617":-0.025778005525948038,"618":-0.12521628734717158,"619":-0.14461297640918475,"620":0.07352655389209448,"621":0.1447377771541185,"622":0.031648060495015756,"623":0.13179235674773027,"624":-0.024868280511087422,"625":-0.04935876833464153,"626":0.14052094405486787,"627":0.01734645671829099,"628":0.19867152067147587,"629":-0.11428528455931344,"630":-0.16995001015555156,"631":0.06488346791284712,"632":0.16425385488304953,"633":0.07683482662098456,"634":0.22391734524479417,"635":-0.0118241039817693,"636":0.028284242893389634,"637":0.019130968446811135,"638":0.032593511567105236,"639":-0.04961650201405179,"640":-0.23438633510212453,"641":-0.19029911201311075,"642":0.04912431135620005,"643":-0.06262818962826547,"644":0.03980513051242633,"645":-0.20322529614280396,"646":-0.15088910877980505,"647":0.050889600326969237,"648":0.18705584421078197,"649":0.11146007372706171,"650":0.04572737701721244,"651":-0.10918727962223354,"652":-0.07169335772504636,"653":0.17551603273078398,"654":-0.12384715638109244,"655":-0.014949105232523938,"656":0.01747431803168428,"657":-0.04736870695152239,"658":-0.011049823860194638,"659":0.02906047815909868,"660":0.04884886737225575,"661":0.11742532593373364,"662":-0.12190739987490852,"663":-0.03117860015041247,"664":-0.0868326701550425,"665":-0.0415398426018478,"666":0.06054996468528452,"667":0.1158747135148668,"668":-0.1333542606549125,"669":0.021538863811831017,"670":-0.16191616827152702,"671":0.0063285002273915395,"672":0.22357795830888189,"673":0.07125033756563659,"674":-0.1604499057127198,"675":0.10037095874326442,"676":-0.06793752134383896,"677":-0.10023776830555436,"678":-0.11504374547451482,"679":0.15752019209816148,"680":-0.19721686338936664,"681":-0.1061592225270177,"682":-0.2094784120744591,"683":-0.1229281611089831,"684":-0.03740158619902003,"685":0.1797402199293149,"686":0.1624993008304922,"687":-0.08625398172755538,"688":-0.13026755097474654,"689":0.2548095185647406,"690":-0.16175348469031822,"691":-0.19205764089844574,"692":0.06903692335843506,"693":-0.07474430840472612,"694":-0.013067887585824205,"695":-0.002822644365563406,"696":0.1830513973253302,"697":-0.004755030502860733,"698":0.012383211750112132,"699":0.010839457820531874,"700":-0.005103417457573983,"701":0.06888285277460385,"702":-0.07318400046749081,"703":0.11984164276524421,"704":-0.040575452973349004,"705":-0.227962623392359,"706":0.028275033469046335,"707":0.08672034431407045,"708":-0.023945974462157505,"709":-0.045780921204597556,"710":-0.2029513864464957,"711":0.0092574565666592,"712":0.23487882579083583,"713":0.14484520196324602,"714":-0.1621327868988339,"715":-0.15912716038148803,"716":-0.17376487041045985,"717":0.03925706182566842,"718":-0.23118880397737468,"719":-0.04341532665941359,"720":-0.16626568178485998,"721":-0.10538986790549952,"722":-0.1811245531794447,"723":-0.14175827084047676,"724":-0.09081595097181477,"725":0.1945119577632934,"726":-0.18808943695966548,"727":0.17355878229983313,"728":-0.023812834349120293,"729":0.00861535514332052,"730":0.04082231358351553,"731":0.19626440312167076,"732":0.09420840111104664,"733":0.1091952504559492,"734":0.18297912342967318,"735":-0.18123633658215327,"736":0.0933302094089434,"737":0.23780212063379844,"738":-0.09090476088741119,"739":-0.012474412501210145,"740":0.0701139311141419,"741":0.0713700923784747,"742":-0.037407408866577375,"743":-0.06815552776476395,"744":-0.2296427996398508,"745":0.034459091837218514,"746":0.12313880319443221,"747":0.022594672680830614,"748":-0.07873903889561272,"749":-0.023460562351638025,"750":-0.045117097176252695,"751":-0.08808210427833021,"752":0.07632182079665108,"753":-0.1386189055591162,"754":0.20898124520207462,"755":-0.18659567935625926,"756":0.14646805145176456,"757":-0.03421343414579464,"758":-0.043758753725905986,"759":-0.15187994165440175,"760":-0.015728615126090386,"761":0.015485129647424458,"762":0.15257024420146384,"763":-0.16565345367849812,"764":-0.1640006096904421,"765":-0.15160233493695371,"766":0.1284750939600763,"767":-0.16227597392076595,"768":0.017355671571136405,"769":-0.07390923148695173,"770":-0.03318115473942191,"771":0.10701018378402102,"772":0.14224367305952104,"773":-0.06602027404575186,"774":0.20614412550140432,"775":0.13924703978109174,"776":0.04106352275520471,"777":-0.187332179386283,"778":0.030342025903969488,"779":0.1246787165556753,"780":-0.14417174674965863,"781":-0.07492458488326613,"782":0.05458016801490621,"783":0.08626355798661105,"784":-0.2331742085721715,"785":0.000124007668664602,"786":0.2651484691679385,"787":-0.02151881553147971,"788":0.13242626582981099,"789":0.0003385084080165015,"790":-0.06482220098007387,"791":0.134076492270257,"792":0.05969201717731399,"793":0.07631994344967678,"794":-0.16860259488138243,"795":0.06437601280662916,"796":0.08753161979398741,"797":0.07935313961240652,"798":0.09093257340430584,"799":-0.16143461488924502,"800":-0.08602786740986472,"801":0.01876915387424896,"802":-0.06234786606300655,"803":-0.1156565504904407,"804":0.1713906884543686,"805":0.19818040710705326,"806":-0.03167856171974594,"807":-0.20970001953518455,"808":0.06130245595594028,"809":-0.12739787706152436,"810":-0.02511528883206349,"811":-0.07987520049221981,"812":0.22329535782367282,"813":-0.15828218813711398,"814":-0.019164781432888092,"815":-0.007326007892983386,"816":-0.021552671546926964,"817":0.08779507824370512,"818":-0.08262818563979155,"819":-0.20615114595833717,"820":-0.02250422199312135,"821":0.09632551791535704,"822":-0.025124410540375154,"823":0.03977746390859295,"824":-0.08083261732291729,"825":0.087992860144867,"826":-0.09305800305380482,"827":-0.12239076472269386,"828":-0.16121359891074116,"829":-0.0033632736093549315,"830":-0.017856956666964807,"831":-0.09984140762180047,"832":-0.23833670831093473,"833":-0.1670464907650791,"834":0.057139774327565424,"835":0.007428212731350986,"836":-0.14234628492164417,"837":0.10982423045577198,"838":0.14488093490884146,"839":0.1447090712320518,"840":-0.08085915576620434,"841":-0.020925842101897574,"842":0.1619189058576485,"843":0.08111597339539411,"844":0.0009034531479095619,"845":0.14705506046638986,"846":0.0738702149818068,"847":0.14488819648042323,"848":-0.21268017296435318,"849":-0.12849992924494805,"850":0.17570613017321057,"851":0.20674395680151436,"852":-0.06446207439617235,"853":-0.17304561245473957,"854":0.13061290659196714,"855":0.030886604537522695,"856":0.010146257712143338,"857":0.2510783838451703,"858":0.16686056797183482,"859":-0.19199406958851262,"860":0.1285607429923617,"861":-0.14692091747092845,"862":0.08116630915352654,"863":0.13732342726790636,"864":0.08409666040493477,"865":0.04913144360925343,"866":0.05240251102235473,"867":0.046977297156086686,"868":0.14662948017677993,"869":0.04737359502581286,"870":0.09278144545393081,"871":-0.009110338746202774,"872":-0.1967042765623855,"873":0.03396019438351132,"874":-0.11941116130548826,"875":0.15632180916049268,"876":-0.08169331146799286,"877":-0.14090707242428105,"878":0.1382933481070551,"879":-0.19495091672128773,"880":-0.001023657696782494,"881":-0.10125937078882179,"882":0.05031422684575484,"883":0.14215022606211092,"884":0.12855399557852235,"885":-0.05689525657120728,"886":0.0881270736463402,"887":0.028398206856737298,"888":0.02591624392190665,"889":-0.08480058509200149,"890":0.1697403239684937,"891":-0.17118329856240924,"892":-0.10855291278710175,"893":0.20479988271980398,"894":-0.18364691840294403,"895":-0.10677375117108781,"896":0.11835810586575402,"897":0.06796480321550252,"898":0.10822116268768935,"899":0.03275544103845312,"900":0.1806653959288538,"901":-0.02191469276511098,"902":0.030777604852740753,"903":0.059531441986508025,"904":0.25373099502516,"905":0.17490278865169906,"906":0.11348306876456535,"907":-0.07161092874484495,"908":-0.08849091926471102,"909":-0.03177419090192036,"910":-0.052026098922145006,"911":-0.04413023876274034,"912":-0.15997224771365787,"913":0.007655640570938306,"914":-0.12092838486978012,"915":-0.14026929175112846,"916":-0.1049457424324647,"917":0.07470070089281391,"918":-0.008766053894058158,"919":-0.19442680410819527,"920":-0.14055040266884058,"921":0.09349525813627904,"922":-0.04997290254758403,"923":-0.06286034218538868,"924":-0.021712818886894275,"925":-0.03309426027013767,"926":0.006996755082845333,"927":-0.047947419209624316,"928":0.10206108032427706,"929":-0.03422010041091709,"930":0.09954163853164162,"931":0.23318235775273882,"932":0.10172615424560043,"933":-0.0939059816142716,"934":-0.10547168123736894,"935":0.216097975143781,"936":0.04903333741115757,"937":-0.02076848602281336,"938":-0.2057594028798736,"939":-0.01211469525034756,"940":0.026695776761554876,"941":-0.12789595755037048,"942":-0.06701707440403838,"943":0.18778740589359919,"944":0.19464496037297083,"945":-0.0634213309660382,"946":0.010328752230030153,"947":-0.021367114263237067,"948":-0.0888886806585494,"949":-0.17511567248463797,"950":-0.12421069940912213,"951":0.1517177977802964,"952":0.14227866176186485,"953":0.027553563668866105,"954":-0.056845070866736166,"955":0.14369817636468585,"956":-0.003959903896925468,"957":-0.17733484412013106,"958":0.15449080361018047,"959":0.15950649110344708,"960":0.05632864158473072,"961":0.12189564123267141,"962":0.16406420133010147,"963":0.034102441638169924,"964":-0.10388593775514765,"965":-0.2040154255052485,"966":0.07003579455761332,"967":-0.05771815803606342,"968":0.16094583683821986,"969":-0.21074819019609042,"970":0.07948653486797456,"971":0.16976905935231953,"972":0.21912385021889172,"973":-0.016780542441749573,"974":0.13579766908114355,"975":0.06488256107724164,"976":0.15899936194905193,"977":0.007017177778597744,"978":0.09132536188004155,"979":0.11440149855970988,"980":0.0011543129280874513,"981":-0.09653566944335157,"982":-0.21752452168478964,"983":0.039666559819134146,"984":-0.029622043733043647,"985":0.059391004071642335,"986":0.15844095032585756,"987":-0.1142559254818893,"988":0.076023191010601,"989":-0.002852091358856452,"990":0.1291263100264855,"991":0.1466354079246857,"992":0.1511970108044675,"993":-0.03835793689791066,"994":-0.053274593248268755,"995":-0.005931692026618127,"996":0.18641266988349559,"997":0.026982665096040425,"998":0.18602524213264887,"999":-0.09785196900190614,"1000":-0.052490951546250365,"1001":0.019347501392196587,"1002":0.05683232650620298,"1003":-0.1403490119293587,"1004":-0.1988622036454993,"1005":-0.21576130501411747,"1006":-0.07632279482229101,"1007":0.029512711009332275,"1008":0.05589514125223355,"1009":0.05463316666723395,"1010":0.0749571489531866,"1011":-0.1369617502503248,"1012":-0.17630768504917727,"1013":0.22283396646630968,"1014":0.1472964715132857,"1015":0.027361981820052804,"1016":-0.020806674671828042,"1017":-0.20204897594183613,"1018":0.06549025364599598,"1019":0.07211163443347325,"1020":0.041598145343790964,"1021":-0.0004503802591381805,"1022":0.0016996552116366691,"1023":-0.005136748927283887,"1024":-0.16333307152886023,"1025":0.12262145519083892,"1026":0.23384774354812043,"1027":0.10377926443884634,"1028":0.08228425676145806,"1029":0.0005540597326109914,"1030":0.08167834004780576,"1031":-0.05533422954871525,"1032":-0.034174192194251454,"1033":-0.18543731292550902,"1034":0.16267673968573323,"1035":-0.17020064804598856,"1036":-0.038973701936958816,"1037":0.06602207508751191,"1038":0.1411655500822239,"1039":-0.176431862778146,"1040":-0.0702765051593255,"1041":0.14844153747100225,"1042":-0.0661238957955082,"1043":0.09584854453999068,"1044":-0.02945210447628855,"1045":-0.11591876493845349,"1046":-0.05174004707855488,"1047":-0.13312179409512645,"1048":0.08019674471883653,"1049":0.027398895615237204,"1050":-0.05071585751781652,"1051":0.02094010101963257,"1052":0.008802890038304366,"1053":0.1460804122741013,"1054":-0.12046873744190678,"1055":-0.04485640057960365,"1056":-0.08253472846451113,"1057":-0.05450938680446525,"1058":0.06999066872225422,"1059":-0.09958615985059582,"1060":0.21326137273763504,"1061":-0.03060763667981844,"1062":-0.16250656979931985,"1063":-0.014401414003486566,"1064":0.01612705510932019,"1065":0.08004032737866734,"1066":0.0730488477296408,"1067":-0.043043586937904915,"1068":0.045598546684827164,"1069":0.149016239136107,"1070":0.16509116156054832,"1071":-0.07850635484070044,"1072":0.13260363178781978,"1073":-0.15126752057401086,"1074":0.03178910037410358,"1075":-0.15694090216662782,"1076":0.1515357733989579,"1077":-0.13513339299104582,"1078":-0.2120631158587825,"1079":0.07975030763428197,"1080":-0.1023998937078905,"1081":-0.18227778343719214,"1082":0.07808700507940555,"1083":-0.030992968311392994,"1084":0.1617207988345172,"1085":-0.08373330531535181,"1086":-0.11183026274971969,"1087":0.09008885962724979,"1088":-0.021384158989833913,"1089":0.1471878635610955,"1090":-0.18245251639527538,"1091":0.00039414118867788357,"1092":0.06938007682390002,"1093":-0.20115309344436202,"1094":0.14946870259126321,"1095":0.09691264611131342,"1096":0.15488995066519728,"1097":-0.1762670381306138,"1098":0.15439352415727606,"1099":-0.12311551598852051,"1100":-0.19412710341322026,"1101":0.08824895642245775,"1102":-0.09547825807601112,"1103":0.04201068377954658,"1104":0.046250738549199776,"1105":0.06599684004623789,"1106":0.1983502524940364,"1107":-0.17926647218983074,"1108":-0.17209677972285237,"1109":-0.01934904398484888,"1110":-0.039634223685175406,"1111":-0.1023031821801931,"1112":0.0016166967937671483,"1113":-0.14565706402998022,"1114":0.14900447025312397,"1115":-0.024911991808968196,"1116":0.17056701960959902,"1117":-0.18157128074492954,"1118":-0.02311651795573916,"1119":-0.18375102636380294,"1120":-0.1467186881850841,"1121":0.1396611200493776,"1122":0.14364665072360647,"1123":0.16681976107341145,"1124":0.049077794800569584,"1125":0.016952511645890282,"1126":-0.14817148755543205,"1127":0.19116563132432043,"1128":0.18633559147228712,"1129":0.1169133343587213,"1130":-0.18225214907248163,"1131":-0.005095020138783486,"1132":-0.08972658364650067,"1133":0.015980850946867204,"1134":0.08415654222883276,"1135":0.061116292774404994,"1136":0.12639872185984394,"1137":-0.20957662852856665,"1138":0.0201046747729688,"1139":0.012592343774394762,"1140":0.3241255875302553,"1141":0.12417508198115251,"1142":0.1409796552918902,"1143":-0.20510322514310184,"1144":-0.057563763103267405,"1145":-0.13822493027726157,"1146":0.14830224128719297,"1147":0.03060515465755238,"1148":0.004603097248574334,"1149":0.1389733479486852,"1150":-0.02608622620501445,"1151":0.11329523584247182,"1152":-0.08112193249748821,"1153":-0.17016725290208778,"1154":-0.00389681560530202,"1155":-0.06380822148919589,"1156":-0.1475319551096774,"1157":-0.20990377991193823,"1158":0.2664583984561237,"1159":-0.17648804140780971,"1160":-0.07300854940555258,"1161":-0.015535842585048048,"1162":-0.12964004568765963,"1163":0.02356384783833237,"1164":0.24001985057171119,"1165":0.14548377043354427,"1166":-0.04071975474405803,"1167":-0.0184515993221337,"1168":0.0823681043997974,"1169":-0.049245358528022205,"1170":-0.11665804743947522,"1171":-0.1514755980718183,"1172":0.11041403873008568,"1173":-0.1889239082860877,"1174":-0.08913442896109243,"1175":-0.05902577569740839}},"3":{"bias":-0.14432058937354741,"weights":{"0":-0.18023839560768717,"1":-0.04133518319803637,"2":0.05638461765423067,"3":-0.15872879096409667,"4":0.009342123696970217,"5":-0.186223680616727,"6":0.004005496943453794,"7":0.1306188049256081,"8":-0.02939193079299634,"9":0.16469943226357792,"10":-0.040400130546409785,"11":0.17548494366088357,"12":0.005860795416339234,"13":0.03026379542864706,"14":0.10586241981707427,"15":-0.00385941739517717,"16":0.11509037761051032,"17":0.026219382390094893,"18":0.11800886333190196,"19":-0.09791481661042672,"20":0.09992326338314982,"21":0.023718661863019522,"22":0.1726902500574159,"23":0.053190664974626774,"24":-0.16070709891924392,"25":-0.1872018055008017,"26":-0.05544883936098233,"27":-0.019935898282510155,"28":0.04098229284387112,"29":0.11096874843391584,"30":-0.09098466053719384,"31":-0.052757749281472706,"32":0.18295727718153107,"33":0.17373582067769794,"34":0.19268011249001643,"35":0.18840314483944012,"36":0.16895952668085382,"37":0.10096976897756789,"38":0.16903391669994622,"39":0.1463170263527507,"40":-0.11130731691391647,"41":-0.11880026461672381,"42":0.19358652570072105,"43":-0.1354167152948538,"44":-0.011406656958856405,"45":0.20045498214285531,"46":0.13516576548569528,"47":0.1461186291363232,"48":0.030314134385609617,"49":-0.17916778978419828,"50":0.06117073373936154,"51":0.09700862517930108,"52":0.12121566444367969,"53":0.19711308599878505,"54":0.08641911119279665,"55":-0.1942957468006253,"56":0.08403247071212881,"57":0.13076948239017266,"58":-0.048681932576958444,"59":-0.07556230952563929,"60":0.07612217232524854,"61":-0.13708556631730423,"62":-0.17537226972054254,"63":0.04622566571931374,"64":0.16979119644164417,"65":0.20130441276624744,"66":0.11903800287540406,"67":-0.021355107154878976,"68":-0.023228442781062262,"69":0.0979140783593509,"70":0.08130084813673999,"71":-0.09413756582420162,"72":0.20068269069841993,"73":-0.10788835750949853,"74":-0.18695972547549342,"75":0.07097540690050728,"76":-0.11488864744829455,"77":-0.04792058099859689,"78":-0.02631655971921508,"79":-0.0788454322304421,"80":-0.10334561833826963,"81":0.17077672748812642,"82":-0.17306953695797317,"83":-0.06447979596771701,"84":0.1045090986288308,"85":0.01321806807630787,"86":-0.1069318833666145,"87":0.042746628784992094,"88":0.16871724737958121,"89":-0.07046754661082393,"90":-0.17583783726824403,"91":0.15072799766886705,"92":-0.10406907070304285,"93":-0.0680234956223885,"94":-0.09190520463445984,"95":-0.16424412567273133,"96":-0.1658588285742197,"97":0.16481503986566676,"98":-0.06955607072239345,"99":-0.15140700661918244,"100":0.06359157197833859,"101":-0.09960192886645568,"102":-0.2225410444809335,"103":-0.04619675828896094,"104":0.1438599492058584,"105":-0.10088948946222308,"106":0.012897656161525427,"107":0.0536013637504626,"108":-0.010216041875416425,"109":0.03500516627171194,"110":-0.0725994581215751,"111":0.09357508879069873,"112":0.1524702249392004,"113":-0.0738948795237333,"114":0.1912098687093719,"115":-0.010074238550178383,"116":0.04392484090965215,"117":-0.0017958235087370844,"118":-0.14211907636314727,"119":-0.15817126992013342,"120":-0.13762606695798965,"121":-0.06515044853382816,"122":0.18018986756706445,"123":0.08450286957682232,"124":0.17774047012761887,"125":0.09306209652848388,"126":0.03453433521375084,"127":-0.011677457743979113,"128":0.1742087481500373,"129":0.11208171667699597,"130":-0.11101350071952087,"131":0.03919085806044382,"132":0.022079635684709702,"133":-0.12295093070412504,"134":-0.1527647938876421,"135":-0.005806029354951474,"136":-0.17627012747870027,"137":0.03779265428431247,"138":0.07425125116817066,"139":-0.03434152248925988,"140":0.18159922938294606,"141":0.025793573509692143,"142":0.07033525963166182,"143":0.07081182965582651,"144":0.10217789005674749,"145":0.18491032936423013,"146":-0.18067383914015941,"147":-0.09013136547466233,"148":-0.06176096990701935,"149":0.09800534584000153,"150":-0.1440227222450301,"151":0.000531681990846851,"152":-0.1207221675027465,"153":-0.1055411499195976,"154":0.04303941127228426,"155":0.1127574873324755,"156":0.07534733743959714,"157":-0.14340253962241517,"158":0.10586878155619803,"159":-0.020687290197153024,"160":0.13064504484597106,"161":-0.13184373384209272,"162":0.11387606820517018,"163":-0.20330003207128836,"164":-0.11297991860504032,"165":0.050298148613590735,"166":0.05268745511481472,"167":0.20057022211244901,"168":-0.1309140816047238,"169":-0.14697086628528327,"170":-0.007596306823004297,"171":0.21375538638754232,"172":0.0970725686077155,"173":0.07180571177527438,"174":0.023546790070919022,"175":0.1129692203763216,"176":-0.04237096689752264,"177":-0.05842581889415381,"178":0.12455284191734131,"179":-0.12247550018281055,"180":0.004850878100330333,"181":0.08165413702058807,"182":0.07164848737886739,"183":-0.08439405258833405,"184":0.1436111578080984,"185":-0.05396835966182955,"186":0.09939856407635428,"187":0.17203923377190586,"188":0.11833036191448454,"189":-0.05143149980999299,"190":0.11537731767240507,"191":0.009541290141500278,"192":0.03795511384475437,"193":0.08144306367487993,"194":-0.06701118423813583,"195":0.06592331657553285,"196":-0.1805203439877574,"197":0.026546228476129897,"198":-0.06721428223231768,"199":0.18203557781913485,"200":0.052145408754955054,"201":-0.09012348249721291,"202":-0.16777372124426362,"203":-0.1564399096239004,"204":-0.10661594260246074,"205":-0.1749176158627905,"206":0.20740323138490543,"207":-0.012426107340639406,"208":-0.07323549887598159,"209":-0.006980912100934999,"210":0.16163861112528713,"211":0.1313530674672426,"212":-0.05369559962310233,"213":0.023403321419672357,"214":0.20719572513501952,"215":0.09049123761085623,"216":0.19097025227247288,"217":-0.10413240353055712,"218":0.11236464462534698,"219":0.057947575188192026,"220":0.0819095627433421,"221":0.11610213115790086,"222":0.15372930108062083,"223":-0.024947198447299063,"224":0.10976847710209335,"225":-0.0894076464224924,"226":0.11298083112199774,"227":0.11690991941959879,"228":-0.0932863638849291,"229":-0.16021051715297507,"230":-0.12527421793301247,"231":0.20594403889060903,"232":-0.17668025133202658,"233":0.2083844019565334,"234":0.19593674020142154,"235":-0.08431376349468792,"236":0.047592114789560123,"237":-0.16489194504278112,"238":0.046731566072767426,"239":0.21511159717264625,"240":0.004041253482381419,"241":0.19076774970349353,"242":0.0650869037843118,"243":0.07483007256805024,"244":0.004818932764755267,"245":0.0037765467378931615,"246":0.20175486608626664,"247":0.2004610614670613,"248":-0.030494550314020426,"249":0.0028341825352857096,"250":0.1413122669481698,"251":-0.22208324314003178,"252":0.10984883030751028,"253":0.03231572411125256,"254":0.052824150019327776,"255":-0.15069435267041262,"256":0.006974455069268454,"257":0.09338257937379994,"258":-0.0011470129649700188,"259":-0.16590474572960393,"260":0.20291816508642033,"261":-0.053549569554461704,"262":-0.1704487243080239,"263":-0.01519389433709465,"264":-0.002897970301516152,"265":-0.16964690138371916,"266":0.14061632580229697,"267":0.04021684371281096,"268":-0.12458295135341453,"269":0.029691035663495697,"270":-0.1441347247231244,"271":0.01767744206067999,"272":0.022390982029693134,"273":0.06268471004210889,"274":-0.029023619497611168,"275":0.12272372288127247,"276":0.05408735530571326,"277":-0.03019784543001786,"278":-0.07859146681202488,"279":-0.03456632226327533,"280":-0.08798462569582606,"281":0.13227155219091535,"282":0.09314140801212631,"283":0.20389891718628703,"284":0.025544969668592116,"285":-0.18250726944748458,"286":0.16924626186489852,"287":0.08554376498959843,"288":-0.060323529466240346,"289":0.20381737368889152,"290":0.06924003332239488,"291":-0.07740415473818614,"292":-0.012206498786102509,"293":-0.05693277880907495,"294":0.08684621915210716,"295":0.15663220198719166,"296":-0.16254357396471422,"297":-0.14454485670221917,"298":-0.038125636049056645,"299":-0.0627664406878573,"300":0.16865527711625725,"301":0.038224974518458014,"302":0.0931429618207204,"303":-0.11333641625535862,"304":-0.04275734413433974,"305":0.13857893687535683,"306":-0.1608183285092287,"307":-0.1803125109264442,"308":-0.09711350185755929,"309":0.1546056548483547,"310":-0.017257438834708996,"311":0.1964998555394075,"312":0.12298926534983982,"313":0.1239172617944101,"314":0.0071275868057919375,"315":0.026909215185415662,"316":-0.06466892030734853,"317":0.19808305320502348,"318":-0.08031476891334849,"319":0.15869165442629188,"320":0.0012759885522898404,"321":-0.007658523249586615,"322":-0.09261633690595235,"323":0.19382351905994577,"324":-0.039922809735633294,"325":0.021225332107493763,"326":-0.12093294977226478,"327":0.18502390356823192,"328":-0.1840502303880693,"329":-0.0039039125946481287,"330":0.04268828333927703,"331":0.17784004482200497,"332":0.013841549833208015,"333":0.08363055023234596,"334":-0.02045662454587635,"335":-0.14503373721950763,"336":-0.023571243847790538,"337":0.008206063766784474,"338":-0.04620067144884476,"339":0.0300186507194082,"340":0.17798541689186143,"341":0.04757588826256203,"342":0.10613317375243317,"343":-0.15215382921912624,"344":-0.19239564079976482,"345":-0.16373056154900495,"346":-0.14764466722444006,"347":-0.04917770398827307,"348":-0.014710131424670767,"349":-0.06875310338494708,"350":-0.10824332620248206,"351":-0.13846986350810514,"352":-0.13783443481549298,"353":-0.1733018048823994,"354":0.12409385576353905,"355":-0.1908088390054047,"356":0.1471843451535196,"357":-0.15882815489533744,"358":0.19253582601273497,"359":-0.051573935355040554,"360":0.07426227885654214,"361":-0.15996192876063475,"362":0.16940255079626687,"363":0.20684027707716926,"364":-0.10013329570879555,"365":0.17600629541129525,"366":-0.019027072201217767,"367":0.18453222478973497,"368":-0.1075151792824575,"369":-0.049106342025364,"370":0.032807667154456384,"371":0.11539739785356612,"372":0.10541754436140424,"373":0.024972489450256864,"374":0.051859341101907375,"375":0.06468786478180846,"376":0.037952956516779435,"377":0.15784371300691422,"378":0.07937163887094947,"379":0.15177078951196774,"380":0.012814180332367229,"381":-0.07531382663190501,"382":-0.13435530830208484,"383":-0.04379454696177371,"384":-0.1418438405628168,"385":-0.1859238153786246,"386":-0.0705785414302511,"387":-0.033371274441062575,"388":-0.19019630216524092,"389":0.11973784771585569,"390":-0.07330225930367586,"391":-0.03023175596600287,"392":-0.10849894870383064,"393":0.12558151484153438,"394":-0.10440681603877468,"395":-0.10478692659096714,"396":-0.1566687098388168,"397":-0.17508959374705008,"398":-0.08562985362435112,"399":-0.08918318604031478,"400":-0.034099238881598444,"401":-0.17117741163119318,"402":-0.15334156896110818,"403":-0.0957842496051662,"404":0.19332684011756834,"405":0.1358293612320772,"406":0.11428942056720826,"407":0.03230359158984322,"408":-0.007979534226861488,"409":-0.03205135002488065,"410":-0.0826639921247779,"411":0.16515850375090496,"412":0.012520615774115704,"413":0.13354193259518585,"414":-0.18339736000072207,"415":0.08349431019327896,"416":0.07512741683724647,"417":-0.20500185145266883,"418":-0.03722503845898985,"419":-0.018247759737114403,"420":-0.00676586965116469,"421":0.18519109381641463,"422":-0.027008500190137567,"423":0.09240535607361675,"424":-0.17415259654119414,"425":-0.10694074646660619,"426":-0.13432687550362668,"427":-0.07823100269990459,"428":0.015862152534667436,"429":0.08211464381320463,"430":0.03621529283771996,"431":-0.04751628898106803,"432":-0.14495781420979104,"433":0.21236931046242227,"434":-0.057550486901530085,"435":-0.08438559359103684,"436":0.09405839138222034,"437":0.11921184258732538,"438":0.15839344515989617,"439":0.15581739864019367,"440":-0.11865579429711674,"441":0.16803913153474,"442":0.02572410045421817,"443":-0.14866947237588357,"444":0.12828202507512135,"445":-0.08881138542453089,"446":0.08356734148552088,"447":0.19923976659429865,"448":-0.06767217149698163,"449":-0.12095457864874005,"450":0.0017288994656062665,"451":0.15356797925082802,"452":0.18460453181643252,"453":-0.12858683994987252,"454":-0.18101303908610156,"455":-0.0057956783543009925,"456":-0.08642371542034982,"457":-0.08552379399572908,"458":-0.10564054294492023,"459":0.15623550790709848,"460":0.15087901890246472,"461":0.04200355110319687,"462":-0.0930539176522518,"463":-0.1986591380580632,"464":-0.057580361195454975,"465":-0.15530173681643183,"466":-0.1833982494696579,"467":-0.09877670659520617,"468":0.19928112409794918,"469":0.1382878234353241,"470":-0.14517652220764812,"471":-0.09169692435001954,"472":-0.10856054014508779,"473":0.15756921576334673,"474":-0.10717247630608771,"475":0.17661717255044104,"476":-0.04887644106930869,"477":-0.13581541973153255,"478":-0.20063223835704638,"479":0.10850065564409156,"480":-0.07929405962440941,"481":0.17521802022318014,"482":-0.17860038583716797,"483":-0.08013374686770283,"484":-0.131830461249321,"485":-0.01749525433219136,"486":-0.04132756906292113,"487":-0.04237800655798974,"488":0.15613222985941688,"489":0.17141994164049765,"490":-0.14979091148509743,"491":0.0458920929254975,"492":0.09446199585013725,"493":-0.03233342791502941,"494":0.04110824332454426,"495":0.05955308673497034,"496":0.09049883814163558,"497":0.2025057439708042,"498":-0.15865709622545243,"499":-0.08413492742185498,"500":0.043465900447300074,"501":-0.07657751424824481,"502":-0.19699385041000642,"503":-0.15417770236893522,"504":-0.013139239910761293,"505":-0.018096953281900398,"506":-0.009862484133726309,"507":-0.10699955541231036,"508":-0.06325527548272142,"509":-0.12232642484824771,"510":-0.14874026157807518,"511":0.11534310664524447,"512":0.1803725867291888,"513":0.15017914595166915,"514":-0.023622266542957432,"515":-0.15277705229207994,"516":0.0800808344375328,"517":-0.2041399934738292,"518":0.00020016955098294754,"519":-0.09940085644152204,"520":0.012398788684680882,"521":-0.08924707058217364,"522":0.1392402025851797,"523":-0.09044457633328348,"524":-0.08769808838360495,"525":-0.17216553469260507,"526":-0.13258074142911302,"527":0.19954225936352407,"528":0.10890948606809205,"529":0.022771549543665556,"530":0.015546253640927078,"531":-0.01686886038327115,"532":-0.09313884146720612,"533":0.17183391988924893,"534":-0.09719002524793022,"535":-0.04630207104481985,"536":0.10289536560813432,"537":0.03559077226878825,"538":-0.16419518007869338,"539":0.1137079979120337,"540":-0.1634690134339054,"541":-0.045838080154647416,"542":0.026852517191479616,"543":-0.03284931863522075,"544":0.1868409734278481,"545":0.07051745794046126,"546":-0.03392582180121832,"547":-0.17395817668719418,"548":0.03339268836582924,"549":0.034237771688456715,"550":-0.1671013070302934,"551":-0.003613394164083769,"552":-0.038630863308144484,"553":0.05934628060359738,"554":0.18804422123294964,"555":-0.15139613987887368,"556":-0.11496304253320173,"557":-0.10874735855457547,"558":-0.006101316745618378,"559":-0.20137972521986974,"560":-0.042385873496518234,"561":0.010400221920314642,"562":-0.08309279572790043,"563":-0.18531138980067996,"564":0.04796905078598499,"565":-0.12791860583270714,"566":0.18484780614715515,"567":-0.11737433995929702,"568":-0.11325493974819141,"569":0.16058528813936784,"570":0.18407999571098674,"571":-0.06448424227323687,"572":-0.15762239909395515,"573":0.14696680310021987,"574":-0.15846684011519369,"575":0.10787461044338975,"576":-0.1299747225756181,"577":-0.015114708455209758,"578":-0.12937104209191252,"579":0.1580399262684624,"580":-0.04357290327900559,"581":0.11948983193065706,"582":-0.05046249444658855,"583":-0.026370301221705368,"584":-0.01636459138513336,"585":-0.08867157264334488,"586":-0.01976937025506574,"587":0.074611648315959,"588":-0.04530706218681273,"589":0.021224513063238103,"590":0.19876076913390003,"591":0.19568690922288848,"592":0.0021270230585320694,"593":0.18517515903356385,"594":0.19247271525811813,"595":-0.1714971196877943,"596":-0.11319868001119143,"597":-0.11356818425092978,"598":-0.11657464445166885,"599":-0.01220846744159231,"600":0.08390665880385255,"601":0.05905810700064774,"602":-0.012875858331977316,"603":-0.02657854579453583,"604":-0.07288176617567182,"605":-0.0039941596096076835,"606":-0.11623789803213874,"607":0.1450810031627828,"608":-0.12754631614150988,"609":-0.18667148226299396,"610":0.08162065239837152,"611":0.10839455985988673,"612":-0.07333918133369947,"613":-0.09603073665311405,"614":-0.023297089433331683,"615":0.06038823463990603,"616":-0.02004614690898081,"617":-0.10037576847057353,"618":0.1858324678246987,"619":0.17108648926847064,"620":0.07129939181584141,"621":0.21214713305028804,"622":0.15760975669784186,"623":-0.11047034686438835,"624":-0.15008255607367657,"625":0.20090767860596256,"626":-0.07912363985705596,"627":0.18203013823178724,"628":0.005849352834879676,"629":0.13414878832932928,"630":-0.18628684046530888,"631":0.21011397194221126,"632":0.13214458698392484,"633":-0.04012645782648877,"634":-0.0670016994156989,"635":-0.18433038967770232,"636":0.2043481570425477,"637":-0.18383068553855794,"638":-0.06229745403065849,"639":0.015468700631420617,"640":-0.07616624718880291,"641":0.09347899718782247,"642":0.014470055878396173,"643":0.13784295287951878,"644":0.013031390243839995,"645":-0.06377143265149067,"646":-0.012856595174590873,"647":-0.04293251600722586,"648":-0.09740330323529608,"649":0.0008450993173040881,"650":0.19735512151496687,"651":-0.02737695222586616,"652":-0.15449454181936292,"653":0.164112405377403,"654":0.18605294172333028,"655":0.1682987830408176,"656":0.14668510876535487,"657":0.03153612610062663,"658":0.13779406274249859,"659":-0.11750503809084994,"660":0.020216437981004677,"661":-0.1650052359530951,"662":0.04130108973271433,"663":-0.146819205552417,"664":0.08147832853790557,"665":0.15972838105212891,"666":-0.010114590287834414,"667":-0.18075995090651056,"668":0.06745642815843986,"669":0.0635851749133162,"670":0.1707216531407901,"671":-0.17651425041187557,"672":0.05663016140354629,"673":-0.11944554335009319,"674":0.06639716732875935,"675":0.022588895774789314,"676":-0.139412162535165,"677":-0.0774076963729951,"678":-0.0926244100508625,"679":0.025273139880107796,"680":-0.10547263635687008,"681":-0.05767747781772774,"682":0.1473912561319116,"683":-0.1829350538309152,"684":0.08118720796235525,"685":-0.12999031690210508,"686":0.025542989307928848,"687":-0.16817247201265328,"688":0.14519050566548083,"689":0.11199213610915026,"690":-0.18850600439930307,"691":0.17542369651820938,"692":-0.09382322733794893,"693":0.17823497411320743,"694":-0.04994689794578005,"695":0.12528051052178485,"696":-0.05837642363596272,"697":0.012016810914497994,"698":-0.12448794134375427,"699":0.09984991304260264,"700":0.09531650332138597,"701":0.014546665948942118,"702":0.1111995495031344,"703":-0.09462616033178367,"704":-0.1145952986977813,"705":0.07935638386845595,"706":0.0808882875542549,"707":0.0005925788492235775,"708":-0.05300444351998326,"709":0.13259006064282133,"710":-0.12363550320980662,"711":0.03779739284575449,"712":0.16502419255638498,"713":0.14882688156919013,"714":-0.07274050170410183,"715":-0.07562678939999525,"716":0.17064868346940693,"717":0.10272719445341001,"718":-0.04167637576552133,"719":0.18595289991598776,"720":-0.04791800657666312,"721":-0.04228458545744199,"722":-0.13782429150174597,"723":0.14781002918752445,"724":0.17601900233381856,"725":0.06906137435011656,"726":0.15617692729429508,"727":-0.14207792723535878,"728":-0.1364362771134965,"729":0.13829996443239315,"730":-0.02861132491685164,"731":0.05351957554558669,"732":-0.13758631480352512,"733":-0.0645777709677003,"734":-0.12298745105604016,"735":0.027239364855868087,"736":0.1645977241834027,"737":0.114805513963864,"738":0.20986461157516575,"739":0.0018226463718947598,"740":-0.06534767029438492,"741":0.19857392449515154,"742":-0.1271922966248891,"743":-0.07393896392898916,"744":0.16289081226909197,"745":0.12142514595896112,"746":-0.11183710442460566,"747":-0.09047982727834775,"748":0.12752711761063362,"749":0.005298657834417803,"750":-0.1721739082838101,"751":-0.005871742198658462,"752":-0.14195652095307493,"753":0.11588529765354497,"754":0.15275100006951375,"755":-0.11912519474085394,"756":0.060420194546735057,"757":0.08849605189978048,"758":-0.052409773988717316,"759":0.07100421103756295,"760":-0.015636235019020953,"761":-0.11020525688872197,"762":-0.01041047869873901,"763":-0.08563287934934469,"764":-0.06929948874265474,"765":-0.1031015914074701,"766":0.1754824199390188,"767":-0.11976266991899938,"768":-0.03697945511072241,"769":-0.05851163904507196,"770":-0.10719566589556348,"771":-0.10839347289049296,"772":0.13777812824522664,"773":0.0049677062551680695,"774":0.17142389799567284,"775":-0.1424593138460337,"776":0.10176189662441014,"777":0.02568456275692819,"778":-0.16032251765528402,"779":0.11505658707484046,"780":0.20443091214020578,"781":0.11773441261824427,"782":0.2053689245266994,"783":0.014088137837495232,"784":0.14880757287479496,"785":0.1753600293045011,"786":0.1681744710091561,"787":-0.13967724848854632,"788":-0.03482983408044369,"789":-0.09633338971880627,"790":-0.04692276460461846,"791":0.03450665532734667,"792":-0.018361328084528037,"793":-0.13823843709250533,"794":-0.1303310560087272,"795":0.11438412226615774,"796":-0.14948319219713316,"797":-0.001993626186274805,"798":0.11449584757422447,"799":0.14129182438281562,"800":0.07324762291025276,"801":-0.13767574973737903,"802":-0.18381815132915122,"803":-0.1177137726748717,"804":-0.008885581487544642,"805":-0.09186549475292988,"806":-0.14596019725494688,"807":0.19074139474799276,"808":0.18552315730589009,"809":-0.1745661018226138,"810":0.11361116472974266,"811":-0.09545396832412116,"812":-0.09963968564849109,"813":0.021221777273814555,"814":-0.0925884268251939,"815":0.012803917366000854,"816":0.14226321485675691,"817":-0.08239563703847792,"818":-0.18871992522541411,"819":-0.13732473532104458,"820":-0.15772363290079186,"821":0.16603112599996753,"822":0.024730475109370095,"823":0.026917584216803726,"824":0.07058033227360225,"825":-0.1146329221963889,"826":0.08945083147299969,"827":0.05729788690522536,"828":-0.09694248777433954,"829":0.05883298522594816,"830":-0.014685778881082514,"831":-0.05290950818774277,"832":-0.15679096858118324,"833":0.03582028303634243,"834":0.20058286908364423,"835":-0.08602785370508165,"836":-0.1215427093503666,"837":-0.08979960721074415,"838":-0.11406568058287378,"839":0.01609894206970519,"840":-0.11724427118813263,"841":0.10864287633858305,"842":0.15960392897910716,"843":0.1455771676751401,"844":0.019384507145554845,"845":-0.07765383396807336,"846":0.06847167917452127,"847":0.074194784699968,"848":0.18617061702338297,"849":0.03993187623037948,"850":-0.14539885833683786,"851":-0.17799709812903064,"852":0.033127632747728605,"853":-0.06842809298833621,"854":0.2049334589249301,"855":-0.03657293030512725,"856":-0.05224526774337658,"857":-0.03702851487194933,"858":-0.15039499806571768,"859":-0.12972832967967782,"860":-0.08230726541971407,"861":-0.094119208970349,"862":-0.011587685540469291,"863":0.14363530955420728,"864":0.021505973145570394,"865":0.1563780104530937,"866":0.1856774712138021,"867":0.12386784372553572,"868":-0.09026261855059169,"869":0.12144722479233445,"870":0.1427491092574881,"871":0.007291013001252282,"872":0.17073224958217914,"873":-0.003838687536765297,"874":0.13492749747599944,"875":-0.1329771627000008,"876":-0.024736493305149772,"877":-0.06698064215077508,"878":0.07393507876733961,"879":0.09563850098179921,"880":0.1356985388895622,"881":0.044454602270481224,"882":-0.13613534197156935,"883":0.18860702777397262,"884":0.19721438689981877,"885":-0.09402262805839962,"886":-0.12099661866009907,"887":0.09412341746748985,"888":-0.0231195110372249,"889":0.054864401736214846,"890":0.024040803982447793,"891":0.19697728209301846,"892":-0.08866313840000126,"893":-0.16402492792202295,"894":-0.010675353422173474,"895":0.1591979325148386,"896":-0.030847365221660372,"897":0.13133915511062244,"898":0.18044627561203527,"899":0.002555452026441951,"900":-0.05072879563473113,"901":-0.03948567502292674,"902":-0.10495138017454693,"903":-0.11864382663184722,"904":-0.21850167807948678,"905":0.1287923349608024,"906":0.1969291749671687,"907":-0.06128182235156292,"908":0.17347987452514518,"909":-0.18434363354936806,"910":-0.15000070152684142,"911":0.13771297870043475,"912":-0.12923608060039493,"913":-0.05883894434573575,"914":0.1483049115572401,"915":-0.029396818083449967,"916":-0.10731910118172454,"917":-0.1166548056581936,"918":-0.18559838311604243,"919":0.03131342120427719,"920":0.05107207112458673,"921":-0.1319777771962193,"922":0.06603728211099068,"923":0.013990552775853793,"924":0.19189790019574582,"925":0.12073204185878438,"926":0.060435091959696825,"927":-0.02123175612271903,"928":-0.0707167306880962,"929":-0.08519775006773417,"930":0.13843151268225776,"931":0.11956393359629158,"932":-0.20373111535141525,"933":-0.07291477385160165,"934":-0.17021613789274012,"935":-0.11162911260803789,"936":-0.00936379127639887,"937":-0.08441706320195254,"938":0.08190204693095252,"939":0.20284064358532183,"940":0.04225179583036989,"941":-0.03540716471025915,"942":0.07844153070071214,"943":0.17089977417289878,"944":0.12608719640282162,"945":0.19871025534358608,"946":0.07460934594481054,"947":-0.17982083383118236,"948":0.04310544079540917,"949":0.04736965896430325,"950":-0.16403006401629264,"951":-0.13234636196339283,"952":-0.0425093662262842,"953":0.10818529101424142,"954":0.16582329974397125,"955":0.1529951565768356,"956":0.10235545558930202,"957":0.20427332427399258,"958":0.09860330758879154,"959":-0.08383377365093567,"960":-0.048653116390028436,"961":-0.08243505825055515,"962":0.008547749759241736,"963":0.012925977424034271,"964":0.19566998102877126,"965":-0.1714287275361131,"966":0.07270002567051125,"967":0.007281634393022984,"968":0.11600836099776733,"969":-0.09593945622591359,"970":-0.07619422773881523,"971":-0.12280123735228628,"972":-0.16303347491101672,"973":-0.1707236572578787,"974":0.061788020503632884,"975":0.1740361619945076,"976":0.11091907754202479,"977":0.03147234724587418,"978":0.11658520981542486,"979":0.04106760431105377,"980":0.13799151304127427,"981":0.06335107414530902,"982":0.19505253819959778,"983":0.08099266796837473,"984":-0.15180327568597615,"985":-0.18709484717533081,"986":0.043675704668231514,"987":0.2138603065206445,"988":-0.021115568042711308,"989":-0.08342018226990891,"990":-0.09164750993708205,"991":0.08748290547543834,"992":0.17128712115385025,"993":0.09064032806926514,"994":-0.1060068860920615,"995":-0.18505127060669985,"996":-0.09997319748373484,"997":-0.009876099222395423,"998":-0.12463868657431383,"999":-0.14448921957486535,"1000":0.013923970353366072,"1001":0.07333634508741096,"1002":0.019355486302519778,"1003":0.08572687859924669,"1004":0.0027152106535073563,"1005":0.028857146364609197,"1006":-0.0323639968558436,"1007":-0.15743467323207852,"1008":0.1425878897718448,"1009":-0.1694693415270062,"1010":-0.10088431911008029,"1011":0.035786024477456775,"1012":-0.07562798387043991,"1013":-0.12976661625755476,"1014":0.08247210210389631,"1015":-0.08627008691216226,"1016":0.07857164139708549,"1017":-0.01380758766649338,"1018":-0.05276930004806525,"1019":0.1561583576961868,"1020":0.06050419193592663,"1021":-0.06322820713455905,"1022":0.11601474630198921,"1023":0.21227315011377995,"1024":-0.011310499460504482,"1025":-0.09083509993066276,"1026":-0.1322946078114163,"1027":0.12675689797506218,"1028":-0.08013826629287966,"1029":-0.022576299084562275,"1030":0.10925240772001188,"1031":0.020625215532577477,"1032":-0.20119661962850932,"1033":0.1774512553657901,"1034":0.04542091133259143,"1035":0.1853276806771811,"1036":-0.1740621123455316,"1037":0.037941662202653395,"1038":0.098996766260433,"1039":-0.14277880446662858,"1040":-0.051507642943514655,"1041":-0.0287410980779077,"1042":0.05823454437183178,"1043":0.18317040440120969,"1044":-0.0013745288758707048,"1045":-0.08675435075067074,"1046":0.07593391529038902,"1047":-0.08356179721605045,"1048":0.09790132417423973,"1049":-0.17118972563333085,"1050":-0.050461180913851086,"1051":0.0778509264477338,"1052":-0.02684700405486285,"1053":-0.1345159495770659,"1054":-0.061380062480633886,"1055":-0.12434317504348523,"1056":0.0025806155394098897,"1057":-0.18107088333042815,"1058":-0.04513521791849143,"1059":0.10443189100077821,"1060":-0.000035721438633830835,"1061":0.1258870024920651,"1062":-0.17212576407395272,"1063":0.041113274336173594,"1064":-0.011417408708030591,"1065":0.006929194088683775,"1066":0.14033995643367728,"1067":0.0393451200865657,"1068":-0.12445030535163114,"1069":0.1361160070497754,"1070":0.06035887303720914,"1071":0.1059675716068276,"1072":-0.17202158252952032,"1073":0.19345943405936672,"1074":-0.0032797666142108566,"1075":0.11796741295446851,"1076":0.16878293504520622,"1077":0.05804656382687982,"1078":-0.1895844440726761,"1079":0.15230674701020858,"1080":-0.0963902378142526,"1081":0.014782909005134787,"1082":0.06481360539348796,"1083":-0.1068951327950294,"1084":0.022819541617802093,"1085":0.1297971438576645,"1086":-0.044291139750443825,"1087":-0.0385772254647147,"1088":-0.02493671024934815,"1089":0.1424004359260117,"1090":-0.09686523196267266,"1091":-0.019593829620995346,"1092":0.01435750888503719,"1093":0.025404929916256643,"1094":0.16907947152753924,"1095":-0.03658264541492688,"1096":0.0983693725579583,"1097":0.07997042304343908,"1098":0.11741442720067499,"1099":-0.09716114413519865,"1100":0.18312352918382213,"1101":-0.08799200717739468,"1102":0.06023728972140262,"1103":-0.1913438128861404,"1104":-0.06163050726818738,"1105":-0.1159675199354025,"1106":-0.028312246895703462,"1107":0.013338356276935685,"1108":-0.0953305417585896,"1109":0.0803798545625419,"1110":-0.18845381880463596,"1111":0.09249972575070732,"1112":-0.1014095896984827,"1113":0.03409002387180875,"1114":-0.014564183144111852,"1115":-0.15369301977735783,"1116":-0.1486468087560743,"1117":-0.16339131164530377,"1118":0.08936691603190015,"1119":-0.15722003523175526,"1120":-0.1182546337210263,"1121":-0.12113524755608643,"1122":-0.21018636249301362,"1123":-0.02331983961350939,"1124":0.17439297566461634,"1125":-0.1061239126051897,"1126":-0.07812028844714268,"1127":0.09641577982817201,"1128":0.03951426822242442,"1129":-0.03482616770228737,"1130":-0.07819667601656739,"1131":-0.07410159793537661,"1132":-0.17273118162127707,"1133":-0.10090021225545495,"1134":0.12576089621108857,"1135":0.09089833760993825,"1136":-0.10128423589055448,"1137":0.10438089108025878,"1138":0.04289574175950339,"1139":-0.1289205796412766,"1140":-0.06785149755986704,"1141":-0.02567134926483578,"1142":-0.14168812639251532,"1143":0.04067713772043398,"1144":-0.057276663639719665,"1145":-0.14176900896247938,"1146":0.13093599533122996,"1147":-0.17236643166344065,"1148":-0.029465779139386847,"1149":-0.13717240726412544,"1150":-0.1460597290308867,"1151":-0.0356230817049608,"1152":0.1268272147952532,"1153":-0.09339880383645868,"1154":-0.14793678847585487,"1155":0.041337643923489105,"1156":0.1744873382874559,"1157":0.16703834214082347,"1158":0.11553733756653889,"1159":-0.05358701379967391,"1160":0.1166506851650539,"1161":0.012958530781768045,"1162":-0.05393508251136699,"1163":0.10948894100519586,"1164":-0.05982610857396833,"1165":-0.10543511483092388,"1166":-0.019976103444726515,"1167":0.10697882841277884,"1168":-0.11900403408459623,"1169":0.07348700405706966,"1170":-0.163046404000873,"1171":-0.08253009951917073,"1172":0.14878433980215316,"1173":-0.156467883353564,"1174":-0.016793736582382143,"1175":-0.0458185214127232}},"4":{"bias":0.2014244139378797,"weights":{"0":0.06995771605951417,"1":0.05407480070722407,"2":-0.11484229216682985,"3":0.04363114223082922,"4":0.1350113252119206,"5":0.19119711056462288,"6":-0.10665191752470558,"7":-0.04859902127901747,"8":0.0523666016040263,"9":0.09669280955190131,"10":-0.13161466067106392,"11":-0.020759011139907482,"12":0.0931431306110344,"13":-0.15624491310413577,"14":0.1827497549396569,"15":-0.04771042513268985,"16":-0.002603691889324779,"17":0.16127573680165003,"18":0.04865210172615815,"19":-0.18614783190765682,"20":-0.13336370381033733,"21":-0.035646566220816286,"22":0.0866495341020551,"23":-0.08677437681215402,"24":-0.11078657798334147,"25":-0.14341332172340066,"26":-0.10684478780547446,"27":-0.09043893596672882,"28":-0.0300254531580096,"29":-0.17772851318767544,"30":0.05870269344619855,"31":0.14129557810118595,"32":-0.07664410669036181,"33":0.11694215956993105,"34":0.050412899384125305,"35":-0.12321436905263629,"36":0.12418158316097526,"37":-0.022419865437702493,"38":-0.042298175385550266,"39":-0.02241369697965923,"40":-0.012078530132500001,"41":-0.020042738287024242,"42":0.1768006009435796,"43":0.20203067149820098,"44":0.10777890726203215,"45":-0.10656827560792438,"46":0.001362542793722922,"47":0.09227758145036993,"48":-0.034865142633567665,"49":0.10764018766179544,"50":-0.017031549248441934,"51":-0.19327882320126485,"52":-0.08099930325564508,"53":-0.011550951812788288,"54":-0.005031831187222685,"55":-0.07482137116815546,"56":-0.014595832512402276,"57":-0.09047593914153836,"58":-0.1601561360700271,"59":0.01666419295230036,"60":-0.043032241952636024,"61":-0.03447869522031845,"62":0.08735512447021351,"63":-0.13959518500731635,"64":0.00912525929292127,"65":0.078779488822132,"66":-0.03530890847024391,"67":0.08356337631676537,"68":0.12263327198953264,"69":-0.14943723883595456,"70":-0.1104084483924654,"71":-0.08707514126768792,"72":0.11390924074179741,"73":0.1390161737344654,"74":-0.024564546718715545,"75":0.06818806443992063,"76":0.15885843251876092,"77":0.04982765837433136,"78":-0.13258794917158218,"79":0.03382985380312779,"80":0.1156625064784166,"81":0.08725288346337895,"82":-0.06545392378526327,"83":-0.05476829663635963,"84":-0.018939338028775603,"85":0.15337131940979332,"86":-0.027834658419175772,"87":0.09966157780476306,"88":-0.1819412867320829,"89":0.07119408768103161,"90":-0.028328286251633007,"91":-0.16661685207857987,"92":-0.14711418823612266,"93":0.17512272624945616,"94":0.02801806033165441,"95":0.1443906663211871,"96":-0.08177029091929175,"97":-0.0022658600448453568,"98":0.06110386003314238,"99":0.15600799291060158,"100":-0.08421704948658107,"101":0.17016063267388418,"102":0.15498431805450769,"103":-0.06856646775630956,"104":0.013313816451836932,"105":-0.0410068277006381,"106":0.10807830900189926,"107":-0.030648897960622416,"108":-0.07929141656341758,"109":0.07160878425807667,"110":0.06673592774197434,"111":0.19342224479317904,"112":0.06779762812095406,"113":-0.12352272550233019,"114":0.1684371937152309,"115":-0.14426861296923457,"116":0.09926328848988476,"117":0.04897372065665139,"118":0.16177114511838028,"119":0.18625943505052125,"120":-0.13145368356929174,"121":0.06807593827073959,"122":0.14636236839670907,"123":-0.15212184564042744,"124":-0.13371337439271805,"125":0.15089604852056504,"126":0.14442840328825118,"127":0.09859053876673546,"128":0.08008721822877708,"129":-0.12028485469648487,"130":-0.18231282441480953,"131":-0.0965291627250862,"132":0.0783755015540063,"133":-0.011364094096801662,"134":-0.07772697315979911,"135":0.04146928557112384,"136":0.10376907494273382,"137":-0.17545221410987433,"138":0.010797531811696163,"139":0.13573666982955443,"140":-0.009432666950486708,"141":0.13116026858679128,"142":-0.05838581051853259,"143":0.041677350629889344,"144":0.19020339832971844,"145":-0.004469775774603369,"146":0.06899515154742547,"147":0.14249658515456173,"148":0.08042463347899674,"149":-0.04368784643275987,"150":0.16364688481529924,"151":0.17572471668454914,"152":0.11491465008904597,"153":-0.09309757604486688,"154":-0.09249421865581713,"155":0.18038894347277565,"156":-0.042161351621664435,"157":-0.06333473590811126,"158":-0.009593024772407319,"159":-0.16879521888982202,"160":-0.18357391818406685,"161":0.05066230792646091,"162":-0.06179446681721414,"163":-0.13063345056549946,"164":0.131703515635978,"165":0.12188961350413258,"166":0.09375792718805824,"167":0.0842639904094918,"168":0.04408145598448973,"169":-0.04974935217768484,"170":0.1847267873080766,"171":-0.01688874075207834,"172":0.06296059277433085,"173":-0.18687496581460844,"174":0.18144644729299167,"175":0.08224476694957927,"176":0.03514144506752531,"177":0.0999154561514417,"178":0.131241347863855,"179":-0.03600289173859918,"180":-0.1464187321000427,"181":-0.043190559390412914,"182":-0.005507867726827822,"183":0.18432082207084052,"184":0.12113918544997274,"185":-0.049841382832039476,"186":0.15381104652530905,"187":0.09546802329095756,"188":0.16698675688300746,"189":0.17996871418747235,"190":-0.1446353170908166,"191":0.021245505870863293,"192":0.038720421725574404,"193":0.09719714762573754,"194":0.08183769732595089,"195":0.08237770665752839,"196":0.025340048700080407,"197":0.09460818291035386,"198":-0.04999437722992783,"199":-0.051869321617377125,"200":-0.16101886611523517,"201":-0.014660202084304986,"202":0.11150466521507633,"203":-0.07888112905377362,"204":0.03327550348079782,"205":-0.06678739294954401,"206":0.04023801674836759,"207":0.09235638428373276,"208":0.20176241045382526,"209":0.18139844835409968,"210":0.20075697134644802,"211":0.13745790388156726,"212":-0.012296278346025273,"213":0.22164357785657388,"214":0.12983269764003744,"215":0.16928913697418874,"216":-0.03761587252875057,"217":0.19661686201111714,"218":-0.1386238183130078,"219":-0.10040722922723895,"220":0.20995242935803946,"221":0.06489934949432251,"222":-0.15505649884137812,"223":0.01540287186524489,"224":-0.052113519184968427,"225":0.02451308141648879,"226":0.11241076480618716,"227":0.12508226856705146,"228":0.14566643160184878,"229":-0.174923028242902,"230":-0.14348645925899708,"231":0.058284753425874074,"232":0.007445698116891568,"233":0.15285277489736343,"234":-0.13820846553208455,"235":-0.039288829782826155,"236":0.10743148053536683,"237":-0.09158850569408301,"238":0.16649984683086916,"239":0.0684593010101719,"240":-0.004987589812173613,"241":0.11329887397395945,"242":-0.17249043122522886,"243":-0.09239882205402754,"244":0.08189659535608576,"245":0.04902929312175529,"246":0.016095963255994945,"247":0.21724420451967616,"248":0.056572431675320244,"249":0.07053042891266614,"250":-0.1891977161290044,"251":0.03232979710439759,"252":0.20594063729603088,"253":0.13879151168209278,"254":-0.13700263496423803,"255":-0.1554247476346895,"256":-0.10486084307933607,"257":-0.000029427799775924444,"258":0.06818003856914971,"259":0.10233558483786527,"260":-0.06891700497070238,"261":0.14127864664353124,"262":0.034148727768987454,"263":0.06631004336491092,"264":0.1915195635154647,"265":-0.13543626285684204,"266":0.19617849785222602,"267":-0.0394310117839798,"268":0.0978365528957268,"269":0.19010850261872905,"270":-0.027617746975012215,"271":0.18458797630239326,"272":-0.0062903401150971325,"273":-0.01858858112235058,"274":-0.054491054008232565,"275":-0.051929431992749436,"276":0.0818689229320257,"277":0.002272670456109069,"278":0.09382426073684087,"279":-0.05588805344926264,"280":0.1807287181030246,"281":-0.051763623849325285,"282":-0.18763040879806067,"283":0.19735962633695628,"284":-0.054299291013699576,"285":-0.059870263047940735,"286":0.15129331441526278,"287":0.05528673470094846,"288":0.19423447944823893,"289":-0.12293497841332596,"290":-0.1363391405329478,"291":-0.17000210764123438,"292":-0.04946567111622509,"293":0.19768859284880952,"294":-0.0731907194743045,"295":0.03883665552545738,"296":0.07654343046769362,"297":0.02508142257882628,"298":-0.0822269490364829,"299":-0.016128634579682895,"300":-0.1735338640312638,"301":-0.11768007777653385,"302":-0.013572303510433684,"303":-0.17275781679937474,"304":0.06199420616821857,"305":0.06240791520543243,"306":0.1318777550650235,"307":-0.04569497157460857,"308":-0.10171177735183033,"309":-0.08267546727630111,"310":0.15832442075463313,"311":-0.12899390241653813,"312":0.20375957466074748,"313":0.006996627780580041,"314":0.11496041739610358,"315":-0.071437226014992,"316":0.01653433037814198,"317":0.052845774151251315,"318":-0.05487746767205597,"319":-0.13171588303818527,"320":-0.11843062952513685,"321":0.06818910053512202,"322":0.06457807286325622,"323":0.14884863881667254,"324":-0.12299987663098379,"325":-0.17564078149372872,"326":-0.015169011682090408,"327":0.02155554114905386,"328":-0.07863818665311512,"329":-0.0492702300822985,"330":0.03485491227517423,"331":-0.018575815723006893,"332":-0.01192946001542329,"333":-0.09643369884901036,"334":0.0769517988050482,"335":-0.16736672092934018,"336":-0.0018930496335161826,"337":0.02486765466097163,"338":0.17187486866047347,"339":0.0945773468727516,"340":-0.09314639199109248,"341":-0.0951302129598587,"342":-0.04983090848229853,"343":-0.12098919896748125,"344":-0.09312531522688457,"345":-0.16857104320711605,"346":-0.16699520689890626,"347":0.1461988851222774,"348":-0.07196156583836304,"349":-0.07116871982118861,"350":-0.15438033854933927,"351":-0.010345740524163347,"352":0.19585705956794522,"353":0.09895827937144314,"354":0.19187390578189983,"355":0.0589514070835628,"356":-0.033924892998409846,"357":-0.12701073266499988,"358":0.08815884924000834,"359":0.18712343286922173,"360":0.0027808677351202483,"361":0.15178452139223345,"362":0.016970371446794898,"363":-0.04407989780209109,"364":0.1393637913652802,"365":-0.07618467230984134,"366":0.0505225244388811,"367":-0.19889903634984316,"368":0.024455311343124446,"369":0.01094754336268768,"370":-0.11048535720497539,"371":-0.029550130519600558,"372":0.15935938292996843,"373":0.13136817867026088,"374":-0.15325733413589204,"375":0.16212702602651025,"376":0.031034431394716476,"377":-0.19491756802341328,"378":0.0731626792057965,"379":-0.05598322288802578,"380":-0.1830705388408156,"381":0.05815288683678366,"382":0.20313401372086554,"383":-0.1349017314042415,"384":0.10111723238488711,"385":-0.2003580040320904,"386":-0.07229116518789434,"387":-0.027506244803859815,"388":0.14580981663049253,"389":0.14527838669148008,"390":-0.10962905122648642,"391":0.08869636316186229,"392":0.1360855542251426,"393":0.04387195654514976,"394":0.1108620223882199,"395":0.029820944587916207,"396":-0.1619444001746975,"397":-0.19896524622373157,"398":-0.17423931545357169,"399":-0.12897286862523502,"400":-0.18843293888878168,"401":-0.19643982345211672,"402":0.14429333422752227,"403":-0.07020327392765376,"404":-0.12320633702050536,"405":0.1823368944946545,"406":-0.16173753715547812,"407":0.02233710464568091,"408":0.00723183520573476,"409":-0.13609177057330807,"410":-0.11176567762542704,"411":0.11512813679368904,"412":0.05956168178636981,"413":-0.18702651305073412,"414":0.03464626347594795,"415":-0.13223853385665255,"416":0.09230243286580224,"417":-0.008701556037662109,"418":0.1269163688589169,"419":-0.041534250876359126,"420":0.13592585037759372,"421":0.10914173165206946,"422":-0.11052402948354749,"423":0.03486129605935199,"424":0.06527673487712361,"425":0.05858886649208191,"426":0.1336786363578724,"427":0.0347922350635581,"428":0.17074549058568692,"429":-0.1551140847282188,"430":-0.1168110249724755,"431":-0.08318884148146187,"432":-0.09414188487772793,"433":-0.07067465825423506,"434":0.09370119214407144,"435":0.10444481439746331,"436":0.11583723459473641,"437":-0.09197339413274151,"438":0.13328711750151867,"439":-0.0565530474076226,"440":0.10235032421461546,"441":0.06776110843990188,"442":0.09666262710479424,"443":-0.10809594947831916,"444":0.145284009893878,"445":0.046967002625610814,"446":0.11118656554708588,"447":0.17691068463393678,"448":-0.14767260544428704,"449":0.02638727421974675,"450":0.1834354134775593,"451":0.057712529877773346,"452":-0.07009117590591225,"453":0.14129629850011002,"454":0.15700106406823333,"455":0.058840575589638976,"456":-0.1826597298497492,"457":-0.13490599027156341,"458":-0.09169193328208011,"459":0.0030967355662127266,"460":-0.2038420917690443,"461":-0.0837763982914806,"462":-0.1351935400395931,"463":0.1632530139985856,"464":-0.005137682758469992,"465":0.19471900846636156,"466":0.09791713084437752,"467":-0.19758265088632435,"468":0.12129856675743454,"469":0.16909271689966635,"470":0.03922272498566721,"471":-0.10262029415653479,"472":0.19642692394531733,"473":0.13437408516130156,"474":0.05070300721798821,"475":-0.18641258215782322,"476":-0.11852643429663146,"477":-0.09801142850937078,"478":0.07089691723002486,"479":-0.07947526564263602,"480":-0.12746065234883194,"481":0.007275192575834307,"482":0.17794994186371949,"483":-0.01453388436803821,"484":-0.013784296835318276,"485":-0.011629553002266192,"486":0.047447261981538334,"487":-0.09631252086917093,"488":0.06493205858129703,"489":0.008588950257789501,"490":0.026457701865592743,"491":-0.08373678421899645,"492":-0.05114658021325599,"493":0.06579840996902088,"494":-0.09221926003663415,"495":0.01473447665294485,"496":0.07201027636967616,"497":-0.10136456470517402,"498":0.06531926207355078,"499":-0.06385938112450419,"500":-0.15036906762127097,"501":0.05624351296598287,"502":-0.18278787655836698,"503":-0.11612971377086864,"504":0.11929583224461725,"505":0.13552398741115632,"506":-0.09157684717119707,"507":-0.17733268341725042,"508":-0.17699306892995212,"509":0.19036568894923006,"510":-0.17663535657448917,"511":-0.10344852732119522,"512":-0.19332848223317267,"513":0.13214648684435493,"514":0.009284402289818729,"515":-0.14251613216397743,"516":0.08615480387858919,"517":-0.06403887710243572,"518":-0.15954947566855607,"519":0.12355422381602285,"520":-0.0718232467876216,"521":-0.16627111168684425,"522":-0.04185749794420234,"523":0.1372389071211516,"524":-0.026142715523340364,"525":0.05251555093114864,"526":-0.09195200596080984,"527":-0.06656516408113936,"528":0.17575762787611202,"529":-0.029679380542374418,"530":-0.06566737762319196,"531":-0.16543167117725666,"532":-0.012716841771976349,"533":-0.03659199577042867,"534":-0.10102548348307397,"535":-0.165760533378487,"536":-0.15656326559083203,"537":0.20519264829127573,"538":-0.05919388724163555,"539":0.1711303509918128,"540":0.12449103533467777,"541":-0.19489899127623334,"542":-0.10169512677690391,"543":-0.18089362298336661,"544":0.1977540413422682,"545":-0.180683401963815,"546":-0.020248549629334762,"547":-0.16658483727635817,"548":-0.07443147220200562,"549":0.17001041860092334,"550":0.014985131982481824,"551":0.00911123211011176,"552":0.1730039511216815,"553":-0.048930783065721,"554":0.06001798539826055,"555":0.10289581165878457,"556":-0.105076000283546,"557":-0.14102321879179366,"558":-0.14204887925207121,"559":0.10512415564308977,"560":0.01916627960741953,"561":-0.16051915244820844,"562":-0.08365494526842818,"563":0.011960051341094234,"564":-0.16258502264292982,"565":-0.1866685097002313,"566":0.1754884437309269,"567":-0.15524082200175293,"568":0.18175138037982538,"569":0.1859557427015004,"570":0.05231623288473519,"571":0.04321770506916978,"572":0.1731307199343815,"573":-0.10558942379496045,"574":-0.07345165540242375,"575":-0.07402953252303787,"576":-0.14123751478032207,"577":-0.2084113596733545,"578":0.10600647655918762,"579":-0.1491537466710384,"580":0.09119003261259344,"581":0.15950277756504594,"582":0.17195219733255998,"583":-0.07987335200973941,"584":-0.009277277795351752,"585":0.1617947518993987,"586":0.012171782714377848,"587":0.13616521404916362,"588":-0.09607494247900943,"589":0.1905193227509803,"590":0.09879485819959133,"591":0.17124223986859557,"592":-0.04743946537093822,"593":0.033453552749547845,"594":-0.061936533856967714,"595":-0.09933276793778813,"596":-0.06359931022848209,"597":-0.03130274667699677,"598":0.04679211389484203,"599":-0.11863163933889166,"600":-0.009637257635585919,"601":0.09849240182158876,"602":-0.18170500244876234,"603":-0.11476368381369245,"604":-0.16537253495018125,"605":0.21783768323505698,"606":0.03370531259071836,"607":0.2086143215541682,"608":-0.18340017796457997,"609":0.18598518732950958,"610":-0.09312407564148503,"611":-0.16346774318308596,"612":-0.12679905024214247,"613":-0.13804755325716292,"614":0.10187599670709416,"615":-0.10554804117610325,"616":0.07393955117951038,"617":-0.02864031141230206,"618":-0.007834182313003247,"619":0.11110428812825748,"620":0.14481216843610376,"621":0.169617354464931,"622":0.12202642258178402,"623":0.03304453926008274,"624":0.10695163236360088,"625":0.10322863304670735,"626":0.120512752995645,"627":-0.049943597410792406,"628":-0.08765897132180453,"629":0.09052994879916858,"630":-0.03258806304227462,"631":-0.07873507994905843,"632":0.12106867876725357,"633":-0.1428522155099499,"634":0.14351263642552073,"635":0.18235114238789404,"636":-0.0020806694597216087,"637":-0.14199426378961458,"638":0.2121631941607368,"639":-0.11599981819609212,"640":-0.14019457399117033,"641":-0.01315758625692899,"642":0.04976259383385328,"643":0.19762114816398796,"644":0.18865101887916544,"645":0.09491530643038067,"646":0.09030736539039835,"647":0.11714248709414622,"648":-0.02994922322872273,"649":0.10588556241906491,"650":-0.11954167169262832,"651":-0.036842163335698355,"652":-0.06473891108286,"653":-0.09325693649298172,"654":0.02589751650392177,"655":-0.03208330734373796,"656":-0.1314613333454746,"657":-0.019307540320126697,"658":0.09606383376962206,"659":0.10404556122761323,"660":0.09075447890968158,"661":-0.12343720904397293,"662":-0.06313077610178795,"663":0.11378687283339761,"664":0.10992060921976204,"665":0.013951482350678791,"666":-0.053622550881404246,"667":0.12354081521154697,"668":-0.0414262908256734,"669":0.010593694121754524,"670":0.1059716795740753,"671":0.1001294816914257,"672":-0.11208839487600945,"673":-0.03172045360874832,"674":0.08161843714424084,"675":0.15574888612234405,"676":-0.06270351424198078,"677":-0.10562552879964038,"678":-0.1354750309444307,"679":0.08102435926131851,"680":0.028933753592935707,"681":0.19706594940585714,"682":-0.08434068213563706,"683":-0.1663735134205184,"684":0.0007408348669470028,"685":-0.025323525297343327,"686":0.051578328508699055,"687":0.20350345106996318,"688":0.08022662636855096,"689":0.14138583324376922,"690":0.12140592451173593,"691":-0.1204535032244124,"692":-0.03249526729965324,"693":0.1455859596057253,"694":-0.13231271420250243,"695":-0.1508326953041473,"696":0.07617675130914114,"697":-0.06534078367046664,"698":0.18125333135535418,"699":-0.12130605409089967,"700":-0.143992039358132,"701":0.0733663842067901,"702":0.16915171236082213,"703":-0.0349689175656723,"704":-0.050551528726325755,"705":0.05718302807150024,"706":0.044567753910859556,"707":0.09725359896237276,"708":-0.0943030224040656,"709":0.08950533284792102,"710":0.0012839788054251223,"711":-0.13971618848800996,"712":-0.06953772144895788,"713":0.06110002681383096,"714":0.15454436979525837,"715":-0.04787308143951813,"716":-0.00836151512329715,"717":-0.14903475867147545,"718":0.11193390816434877,"719":0.03540950145825485,"720":-0.0115661522085345,"721":-0.04374864296850025,"722":-0.0753566443152615,"723":0.09185316952471403,"724":0.05398900087973946,"725":-0.21348839985856502,"726":-0.023715085269842423,"727":-0.10055010813908673,"728":0.18636493389778663,"729":0.08648610621239951,"730":0.1872846121804114,"731":0.13907698433958,"732":0.09933740386100091,"733":-0.1905523403845246,"734":-0.09019749117894853,"735":0.011558963839527325,"736":-0.15731554927118238,"737":0.06664408559627127,"738":0.1580443340708258,"739":0.02923495423490319,"740":-0.11713556219296069,"741":0.14330326082215433,"742":0.07440956645416459,"743":0.0960954758086836,"744":-0.17329595775588416,"745":0.002519147891790488,"746":0.10998739230913661,"747":-0.15259907052887367,"748":-0.10056139633580428,"749":-0.07870454585775444,"750":-0.1739386850204687,"751":0.048558422563255946,"752":0.15157907568712636,"753":-0.11102645112472431,"754":0.08261752444932673,"755":-0.19189720590779774,"756":-0.09075367832186584,"757":-0.09547162539980898,"758":0.10795336130453626,"759":0.14161087563849314,"760":-0.1040911671851714,"761":0.048618699785923744,"762":0.14029739819612463,"763":0.17646215059011644,"764":0.03624194442817289,"765":-0.16301623514630725,"766":0.20879586813040832,"767":-0.05432948324025427,"768":0.14902874313041098,"769":0.06457504012793625,"770":-0.14143309097889517,"771":-0.15684180676325177,"772":-0.024280289126323972,"773":0.10433412554809024,"774":-0.13530250567408128,"775":0.17414341238168363,"776":0.05611627505029845,"777":0.10179478022521461,"778":0.08015140849745311,"779":-0.13408024752041994,"780":0.1839007722214703,"781":0.2022716526549891,"782":0.07190676840454935,"783":0.0257769127795447,"784":-0.15746865020642054,"785":0.07531075883587066,"786":-0.1851442104144846,"787":0.17023784207879553,"788":-0.07679651733809628,"789":0.11916908124946259,"790":0.16242090885619875,"791":0.04036326287711716,"792":-0.11634381403038356,"793":0.00041194905577784057,"794":0.17346823896227498,"795":-0.04335934587627624,"796":0.11232314141601822,"797":0.14138927820356528,"798":0.1552190680586667,"799":-0.18461469268514225,"800":0.15304709178217743,"801":0.11188666149474566,"802":-0.04180073028509911,"803":0.16451300894543044,"804":0.20075154518002644,"805":-0.16109809942267841,"806":0.18752456419543798,"807":-0.02908288473356721,"808":-0.0063228219111470954,"809":-0.001685766722658779,"810":-0.162697745085541,"811":0.060314555965145615,"812":0.09197331975609536,"813":0.08300306671766511,"814":0.18343995052577877,"815":0.026801409863966376,"816":-0.18893237002288446,"817":0.1580728994144808,"818":-0.14152106691715916,"819":-0.07549913832999593,"820":0.049606693676266175,"821":-0.029711690944338804,"822":-0.033620360547116666,"823":0.006083471725751842,"824":0.04686590599228438,"825":-0.10393948900093694,"826":-0.12990148027533155,"827":-0.014168841969934294,"828":0.03292759960947292,"829":-0.1067377653270734,"830":-0.15058022979269398,"831":0.10158662212619407,"832":0.20810959466549958,"833":0.0270075751398258,"834":-0.1043451429027469,"835":-0.09948816458260284,"836":0.1589799941969918,"837":0.029644058179773287,"838":-0.07829465701705175,"839":-0.13445386832122674,"840":-0.1471465543091419,"841":0.08562098821732428,"842":0.1325437635707292,"843":0.14329719792337076,"844":0.12225403249475268,"845":-0.18502767069463297,"846":-0.015524861750077362,"847":0.07405140315855428,"848":-0.029390610790945088,"849":-0.06004429117606874,"850":0.08719879839633467,"851":-0.10669434304740791,"852":0.1413006733255477,"853":0.14019254600261002,"854":0.14751293551553554,"855":0.20386410877262945,"856":-0.12484086359502303,"857":-0.0001982948539893282,"858":0.0573927541608293,"859":-0.026500646711984124,"860":0.08506314553737193,"861":0.09366177121527595,"862":0.12800906671730009,"863":-0.1777194295563543,"864":0.13376315667014227,"865":0.17414126073417432,"866":0.18273840813818856,"867":-0.1064032585879554,"868":-0.2010832472751414,"869":-0.09656096508099747,"870":-0.14064059301589854,"871":-0.1615746672621736,"872":0.18598902523727398,"873":-0.15796990079982096,"874":-0.11102796580468902,"875":0.08804091933590141,"876":-0.035873830681508845,"877":-0.17967796083786783,"878":-0.17971083107051633,"879":-0.13036640583800774,"880":-0.13051114991950297,"881":-0.05877714888160255,"882":-0.05663270275887896,"883":0.017779114590819118,"884":-0.09017267026630343,"885":-0.16868441182737462,"886":-0.05759097552765547,"887":0.07517509888735392,"888":-0.09831627868332127,"889":-0.16933819723443938,"890":0.04719417016526136,"891":0.07127054500455271,"892":0.19585543764989574,"893":0.09554757789082086,"894":0.2037730034234588,"895":-0.09042712143811356,"896":0.1771280539317555,"897":0.14709759657688246,"898":0.07707195797136444,"899":0.033899189123098264,"900":0.137735381380327,"901":0.08337078187674112,"902":0.07980562824768851,"903":-0.041163873540086784,"904":0.0872069694221805,"905":0.09901213399845032,"906":-0.08526764231749533,"907":0.07180963360346959,"908":0.08661293188879346,"909":-0.035631432955854386,"910":-0.12711806910033416,"911":0.14650736587615729,"912":-0.020762688605744966,"913":-0.06769279133824468,"914":0.2025052556428539,"915":0.036340847099755685,"916":-0.07803979230888082,"917":0.1739620968181644,"918":0.02428680198620314,"919":0.06289720152486895,"920":0.1363691633183765,"921":-0.006908246186542743,"922":0.03543375612884241,"923":0.19433900562787007,"924":0.18374560715122068,"925":-0.07045604531127254,"926":-0.0847822607332119,"927":-0.11326331682051104,"928":-0.024798620071760213,"929":-0.0665884787601598,"930":-0.07675701809686827,"931":0.1180453679529416,"932":0.06131542051059448,"933":-0.15788597841601654,"934":-0.0046277302841281915,"935":-0.1903121827995646,"936":0.2081952252984583,"937":-0.0038165931783439066,"938":0.07478353025082231,"939":-0.15752253645647096,"940":-0.006126898469087372,"941":0.11819240372183057,"942":0.03262728051184981,"943":0.1194659449123521,"944":-0.18785772462800115,"945":-0.14671662337768274,"946":-0.026066726406069125,"947":0.027625275414049973,"948":-0.036863561669589845,"949":-0.014329577129259297,"950":-0.02437813224365038,"951":-0.10490114958407773,"952":0.16416298281794553,"953":0.08242706968989985,"954":0.06019478970908208,"955":0.15822743303397166,"956":-0.012914433442514646,"957":-0.03044056158788291,"958":-0.17923182624683445,"959":-0.028597237847704987,"960":0.19077619918496366,"961":-0.0220830918699017,"962":-0.015202504600845618,"963":-0.05971676272701872,"964":-0.08073568517151157,"965":0.21201198363047805,"966":-0.04860001606072867,"967":-0.06552573263759914,"968":0.13120330066256322,"969":0.024071213541068257,"970":-0.14528816581792128,"971":0.020342906771604705,"972":-0.14563588052901588,"973":-0.0623752507706577,"974":0.08057346218501416,"975":-0.14472757425324612,"976":-0.019129414221910557,"977":-0.051806587862368414,"978":-0.05655800123488385,"979":-0.05305023350503554,"980":0.17328930531175657,"981":0.014341402954497613,"982":-0.1565966564462248,"983":0.19293231182872336,"984":-0.006994962390079669,"985":-0.10530424013505288,"986":0.01749906741849014,"987":0.060106269717010816,"988":0.05591888861365695,"989":-0.1367754307227142,"990":-0.015334175917945307,"991":0.186879136830543,"992":0.031059297466066213,"993":-0.16045761041431633,"994":0.1492166136789469,"995":0.14793484415802122,"996":-0.007536543395070263,"997":0.07413504025565475,"998":0.15578816617904298,"999":0.02335758690040942,"1000":0.07077474724037323,"1001":0.12007168407613632,"1002":-0.008259508953717624,"1003":0.15743276377005633,"1004":0.07172923575900186,"1005":-0.07365950775995193,"1006":0.05719586613899486,"1007":0.1864597493365596,"1008":-0.025182113927292235,"1009":-0.16091551238979523,"1010":0.06746527379848682,"1011":0.18182665729102,"1012":0.11055606472063795,"1013":0.11182014193359653,"1014":-0.12530640903980375,"1015":-0.08797630673811635,"1016":-0.0016363168437016301,"1017":0.20873228372166916,"1018":0.09374358549525179,"1019":-0.1741533951239312,"1020":-0.2008360011690472,"1021":-0.06921370761587732,"1022":-0.11403604437429743,"1023":-0.13895212444967864,"1024":-0.18147840485399183,"1025":-0.004193527847756744,"1026":-0.06968195772693477,"1027":-0.18443665719754954,"1028":-0.046617374426749424,"1029":-0.10207424696403733,"1030":-0.16499685176313092,"1031":-0.16519269777854204,"1032":-0.01914227240604064,"1033":-0.1595826176278064,"1034":-0.031699956019452136,"1035":-0.043337444655298596,"1036":-0.1608986777390224,"1037":-0.15930320026261868,"1038":-0.14400589691950155,"1039":0.08662936748327703,"1040":-0.01349916460151018,"1041":0.10991170213457487,"1042":0.06073676547354006,"1043":0.14053734351146985,"1044":-0.0405946855111775,"1045":-0.07768246846280208,"1046":0.13213387025948925,"1047":-0.06909825960880833,"1048":0.09616078380353978,"1049":-0.0809155130110459,"1050":-0.14507131267340728,"1051":-0.0617643963352358,"1052":-0.1495256196864509,"1053":-0.1194040750111313,"1054":-0.008167887653786485,"1055":-0.196227672066383,"1056":-0.20201121792125667,"1057":0.1055467524612239,"1058":-0.042870039271735855,"1059":0.09897015481811874,"1060":0.05802703511301057,"1061":-0.05203616384164986,"1062":-0.02087721496535289,"1063":0.12671382462119304,"1064":0.08013960772761608,"1065":-0.12539337889696942,"1066":0.06045574640785634,"1067":0.08543616230996814,"1068":0.012087831146599526,"1069":0.11192074844398038,"1070":0.09988948395666059,"1071":0.1335486804735189,"1072":0.13939409445639242,"1073":0.18574881967981816,"1074":0.07849782615132028,"1075":0.20401930757409473,"1076":0.1056413305150425,"1077":-0.1662526209239944,"1078":-0.08525358212466982,"1079":-0.04145573432353603,"1080":-0.03926968431158053,"1081":0.1015328303357806,"1082":0.04622356115107912,"1083":0.005486190366420426,"1084":0.07155838950845564,"1085":0.06153211950078394,"1086":-0.05699716944036001,"1087":-0.1607120644828147,"1088":-0.026275103591484664,"1089":0.06667961538136116,"1090":-0.0870359691322377,"1091":-0.1531915816344751,"1092":-0.18630578384705596,"1093":-0.08511494452552117,"1094":-0.003314425133597235,"1095":-0.091336032440387,"1096":-0.18453242850674487,"1097":0.12133864146774355,"1098":-0.14912133972021094,"1099":-0.12414842571795318,"1100":0.07582860154413515,"1101":-0.1100909608280115,"1102":0.021048268356392227,"1103":-0.060289059158269376,"1104":0.20105624155585747,"1105":-0.08829788397796362,"1106":0.12879190137963947,"1107":-0.022573367193772224,"1108":-0.15575768005811924,"1109":-0.01300545876571654,"1110":-0.10943636874214185,"1111":-0.09242429868901846,"1112":-0.057960057723030006,"1113":-0.1613709994105669,"1114":0.13257716245358947,"1115":0.0746079078302288,"1116":-0.20222122655751593,"1117":0.19471571476195879,"1118":0.0014364236401516828,"1119":0.16290933250915388,"1120":0.16808977783657394,"1121":-0.09484090862340512,"1122":-0.05088372239192615,"1123":0.12325376515402799,"1124":0.18358610291762242,"1125":0.2005962191882396,"1126":0.10664342461805018,"1127":0.03408521853936854,"1128":0.1286256224495609,"1129":0.04300088754614331,"1130":0.09721725003082746,"1131":0.11630866463760586,"1132":0.019107999458699468,"1133":0.1494361887588835,"1134":-0.11160198208936854,"1135":-0.11388570989031307,"1136":-0.016933204706378886,"1137":0.13497676338600517,"1138":-0.09165759861568577,"1139":0.12815759939578655,"1140":-0.06398564841868254,"1141":-0.201396460127022,"1142":0.1834716789523171,"1143":0.08150598305443152,"1144":0.13651203508804677,"1145":0.003855716509942623,"1146":0.09048766471139626,"1147":0.031725131721840716,"1148":0.19408659791946503,"1149":-0.12236596642558344,"1150":0.07114000328555022,"1151":0.11138833858799455,"1152":-0.1316922799915634,"1153":0.12035968212644753,"1154":-0.09112052059254674,"1155":0.04021094730732521,"1156":0.05508487529316724,"1157":-0.10683223575955401,"1158":-0.09854927771153084,"1159":0.1860300859955254,"1160":-0.17405411744647264,"1161":0.18178856864559373,"1162":0.19253175350955123,"1163":-0.16145059402162373,"1164":-0.2029908821217105,"1165":-0.09626880992630954,"1166":0.18017632560497884,"1167":-0.00942468328974115,"1168":0.09400433103301833,"1169":0.13451896052405635,"1170":-0.16822669270707877,"1171":-0.02860614822717138,"1172":-0.09627218768831973,"1173":-0.17568088774658677,"1174":0.08045560312756023,"1175":0.023317240116921167}},"5":{"bias":0.01597221714218105,"weights":{"0":-0.2849822000617791,"1":0.0893559978322456,"2":0.1908877774936953,"3":0.0268360883549501,"4":-0.05798397690189723,"5":-0.04639832679369926,"6":-0.09213635011824971,"7":0.18236975957024953,"8":0.044151999415944394,"9":-0.14415073254778582,"10":0.18827804813916874,"11":-0.08086844656262066,"12":-0.007090382458824868,"13":-0.09973765206482962,"14":0.05439205306239922,"15":-0.06117261579381394,"16":-0.12331935500996623,"17":-0.12232797728665744,"18":-0.07461648262116351,"19":0.010947743688217323,"20":-0.0015204578371277768,"21":0.09415736147100957,"22":-0.13538217613229125,"23":-0.034213657127134915,"24":0.18137619581351153,"25":-0.021134533972747154,"26":0.04238529138529455,"27":0.016423453884836993,"28":-0.021046815137759727,"29":-0.1253376491009963,"30":-0.09928006313873435,"31":-0.17041705216086517,"32":-0.18418386907578557,"33":0.06490900979326458,"34":0.07173043707662227,"35":0.11426213231269668,"36":0.06729197146127032,"37":0.04570109389477497,"38":-0.17792087695083716,"39":0.17845968423860506,"40":-0.09960375856203436,"41":0.16652166187115267,"42":0.1272661089046685,"43":-0.07548596535882823,"44":-0.19793975596479918,"45":-0.14027971175061005,"46":0.23458956804133488,"47":0.06938382938237775,"48":-0.1315771378831721,"49":0.003255733544093844,"50":0.11666498882106414,"51":0.08656716188738375,"52":-0.17238161897042908,"53":-0.057752554256511206,"54":0.0977482732402338,"55":0.15293695197049506,"56":-0.03237321003195707,"57":0.05669035156436729,"58":-0.11424840202412508,"59":0.1086493281422092,"60":0.10295033105036636,"61":-0.0800618024853071,"62":-0.24981502336295464,"63":-0.010987082639214477,"64":0.07410494056351905,"65":-0.07535521492410656,"66":0.015023563041273197,"67":0.06458783870980273,"68":-0.12778543149355795,"69":-0.006083963851156383,"70":0.10932003996234503,"71":0.1658861763441605,"72":0.041479757683783834,"73":0.06458425706899293,"74":-0.17370155807937382,"75":-0.13469798407279182,"76":-0.12444580795644686,"77":0.12410103833196401,"78":-0.16217713543563866,"79":-0.07048837005351163,"80":-0.07158896633806865,"81":0.23830308898320782,"82":-0.15175319915219926,"83":-0.0762010644356545,"84":0.1803044077053163,"85":-0.11211485144424761,"86":0.04617899756011529,"87":0.04460812127780685,"88":0.05540467380598493,"89":-0.17891658709853286,"90":0.06749411107916939,"91":-0.08740631411634327,"92":-0.12985083825865648,"93":0.0831473864212295,"94":-0.04655675698128643,"95":-0.1334987321747806,"96":-0.1390686061498664,"97":0.19750213692238247,"98":-0.06873927163114714,"99":-0.005731254805983413,"100":-0.16562738302627,"101":-0.11350942296982867,"102":-0.15291549666503476,"103":-0.03741567351244755,"104":-0.1687401951107878,"105":-0.07174514302004184,"106":0.19258118419745496,"107":0.0820917929163596,"108":-0.01926231815609936,"109":0.011674191939071309,"110":0.19234650117554514,"111":0.20886531608080572,"112":-0.13807207503904448,"113":0.011481219873726222,"114":0.04089305296009697,"115":-0.12310698366341583,"116":-0.047260091708419646,"117":-0.0034479397170544225,"118":0.10999827511171206,"119":-0.02809427340669578,"120":-0.011237949598587284,"121":-0.0326096576603054,"122":-0.21030196666654474,"123":-0.09407906609533288,"124":0.07241983819874473,"125":0.0059752222755299865,"126":-0.16965420982107923,"127":0.1280963318437146,"128":-0.03184989019593797,"129":0.02878201269194345,"130":0.18710575417987046,"131":-0.03831522270431499,"132":0.19850417868238776,"133":0.11409808338803526,"134":0.1699014508484189,"135":0.17105856935579541,"136":-0.24268988491282795,"137":0.05294109636646369,"138":0.046992731570336406,"139":0.07161998505515521,"140":0.018104541702763134,"141":0.15977254559960646,"142":0.006409540940199183,"143":0.1101288360851047,"144":0.042918081149712406,"145":-0.17068678197583942,"146":0.023716539993647298,"147":0.12694084867759667,"148":-0.045324938865302596,"149":0.0984462455573844,"150":-0.22922876475772644,"151":0.10508960108842973,"152":-0.05286868967735633,"153":0.07149208979282533,"154":0.14243629107615877,"155":-0.15355690555887677,"156":-0.09778466225844881,"157":-0.02942026327561396,"158":-0.02792416894224827,"159":-0.13950722436583804,"160":-0.13252198355283343,"161":0.030959890966205033,"162":-0.22564377202938357,"163":-0.09520736630231919,"164":-0.05661421303446059,"165":0.20731411276304687,"166":0.0645850015888938,"167":-0.1672647915620593,"168":-0.15612676293226718,"169":0.10719228354086868,"170":-0.19690299514171522,"171":0.024508573900144222,"172":-0.0990066349368085,"173":0.22045956239604064,"174":-0.019635109232176977,"175":0.08707839179874145,"176":-0.16678479716448508,"177":0.15036147807326417,"178":0.08141445416994024,"179":0.0902505467427196,"180":-0.09939669533865712,"181":-0.26432470166792504,"182":-0.10712555168566715,"183":0.1891580794610768,"184":-0.11037915239048374,"185":0.12892493965635612,"186":0.017141099592569667,"187":-0.27353231065427625,"188":0.05857846886918427,"189":0.2879102895953929,"190":0.14254934589162557,"191":-0.11366095498279674,"192":0.0945951579580976,"193":0.045463189048560844,"194":-0.3540257766916301,"195":0.08172380430798751,"196":0.17133093230579816,"197":0.14978718703932029,"198":0.2563699757813441,"199":-0.0991773010345844,"200":-0.11580880916052234,"201":0.058666132206261185,"202":-0.1428916400738783,"203":0.22771101654507656,"204":0.19572530448676376,"205":0.02368092521138498,"206":-0.09605841505334799,"207":-0.04319455505653608,"208":0.043305836206214914,"209":0.15347149491542264,"210":0.16014209154123457,"211":0.1472375176067068,"212":-0.0033123446117694763,"213":0.1828079955585452,"214":0.1757351244665817,"215":0.05734418379512497,"216":0.07383629440831241,"217":0.08965480310422892,"218":-0.0355893633583606,"219":-0.031607183053260116,"220":-0.0416607701369924,"221":0.2492415855854465,"222":0.029669930659769635,"223":-0.04090070590064399,"224":-0.0537365716178088,"225":0.08016660382857714,"226":0.0971922307762301,"227":0.08511254118557826,"228":-0.03765185516836647,"229":0.023463167237515348,"230":-0.14699252503330243,"231":0.08834638949080914,"232":-0.10502801343585004,"233":0.1709283351426535,"234":0.13992057951839867,"235":0.037084739021546236,"236":0.19976334836476983,"237":-0.1541118125240551,"238":-0.034411128527705205,"239":0.1203746653080213,"240":0.004771169369193388,"241":0.03170310340456188,"242":-0.0794755516969412,"243":-0.07504191290147456,"244":0.006168128213715246,"245":0.07413246085621453,"246":0.10911582944061897,"247":-0.0700260472739624,"248":-0.0834948470317295,"249":0.13899163412067464,"250":-0.18328835029958274,"251":0.06072581899078571,"252":0.06987828847144681,"253":0.02172276469721612,"254":-0.05032030007812113,"255":0.10085975713241171,"256":-0.08780655756900216,"257":0.09154361853038355,"258":-0.12656139949378914,"259":0.04049186374211249,"260":0.04084166172743901,"261":-0.09378270792286143,"262":-0.15055405455753607,"263":0.13762369986389889,"264":0.08179553915175872,"265":0.1734620036464287,"266":0.19487754513171615,"267":0.10778140913772752,"268":-0.16155321584201607,"269":-0.21147946651284596,"270":-0.05939014422706251,"271":0.2425367895755226,"272":0.19217628898093325,"273":0.09168598268655981,"274":-0.04803781096979483,"275":-0.03484428092662359,"276":0.2702893180872775,"277":0.021982472024936466,"278":-0.09616449475564308,"279":0.13722646278945277,"280":-0.2013741887256157,"281":0.1273385586567837,"282":0.004737895438157233,"283":0.11569186536810452,"284":0.2049565394228218,"285":0.18739811525322694,"286":-0.08051745646090913,"287":0.2674045413169364,"288":-0.09185966116086122,"289":0.0978699730167088,"290":0.06772247124351545,"291":-0.1029839686353403,"292":0.09008356228993816,"293":-0.04637940472585278,"294":-0.010735615906511444,"295":0.1876548935669547,"296":0.02308445099671928,"297":-0.11956085342637314,"298":-0.01113538716859096,"299":0.16669729071627065,"300":0.05454939458263216,"301":0.15502170122170278,"302":-0.11556289449849658,"303":-0.07703274230320861,"304":0.06783647189760064,"305":-0.062367341794606776,"306":-0.0013482670949872906,"307":0.187648500877909,"308":-0.16643229617698974,"309":0.14610481163135666,"310":-0.1417172007942798,"311":-0.07922281962211442,"312":0.07534024861706631,"313":0.011172438810880685,"314":0.15339468298499695,"315":0.033284815201562436,"316":0.058701706299760494,"317":0.05793715658841048,"318":-0.14851448020152125,"319":0.006668492049042374,"320":-0.13927533559642527,"321":-0.10827618270299101,"322":0.0024321979364867264,"323":-0.05063668257770478,"324":0.16205065755500764,"325":-0.15301784424303502,"326":-0.12430743843560693,"327":0.05375398883345824,"328":0.023881475927037838,"329":-0.059883097321988675,"330":-0.13880595951783714,"331":0.10671737554085257,"332":-0.12920301322563066,"333":0.22867383067084024,"334":0.038033960324631313,"335":-0.1042489894766274,"336":0.15967880209666246,"337":-0.05824911909729682,"338":0.051050214238548795,"339":0.20263404928216638,"340":-0.15233482878063234,"341":0.16699052977192066,"342":0.18129398327132712,"343":0.07520630138998495,"344":-0.04138074537537038,"345":0.24814397652127812,"346":0.09257538799285112,"347":0.07319782024202892,"348":-0.13462163921919115,"349":-0.14574002531084107,"350":-0.036231236236527936,"351":0.2040855252489044,"352":-0.103173576052422,"353":0.035647503116953534,"354":-0.024149668009752958,"355":0.025300729130940138,"356":0.07368893261449198,"357":0.1459039882970332,"358":0.19947609104619465,"359":-0.01368838153615243,"360":0.11858632795418804,"361":-0.24773505257515946,"362":-0.1586070881024886,"363":0.16162670088174746,"364":0.04098479071019891,"365":-0.12665131689214307,"366":0.20728337111514136,"367":0.04140975709946661,"368":0.06583880983776456,"369":0.2511996941800598,"370":-0.024944164253757,"371":0.06998280151523378,"372":0.05742242890194994,"373":-0.07734688845729137,"374":-0.02013534474203732,"375":0.09463034849994428,"376":-0.09256294720313224,"377":-0.09232385542909825,"378":-0.08852267811901807,"379":-0.02552416959255777,"380":0.2280380652525314,"381":0.01266938400534813,"382":-0.03903316144298147,"383":-0.17917441104404636,"384":0.1040041429052666,"385":0.02161521215379743,"386":-0.24556672309707264,"387":0.16410015806223485,"388":0.21403602630304264,"389":-0.12648512704993478,"390":0.053815010105324676,"391":-0.03833996674105714,"392":-0.17332142429672745,"393":0.10929167220160696,"394":0.151247469248226,"395":-0.14543179157451516,"396":-0.1500035318128219,"397":-0.15748440878297945,"398":0.16594397923320844,"399":0.21644551344404178,"400":0.13632716182055768,"401":-0.07541325166225406,"402":0.2203055894140892,"403":0.15741887455106252,"404":0.07837291921637118,"405":0.16909096506624363,"406":-0.13541201477758014,"407":0.03639104071253963,"408":-0.06260541671727576,"409":0.04813438737137309,"410":-0.1388573223756272,"411":0.1405413275821057,"412":-0.09844071928736502,"413":0.03354798375859682,"414":0.017933971833271237,"415":-0.08168422548958716,"416":-0.10942463822525911,"417":-0.17609520121648448,"418":0.006835504900844128,"419":0.08573892646453309,"420":0.20284725921418437,"421":0.1825464675814391,"422":-0.010852897141923966,"423":-0.06976997447162081,"424":-0.006557144741493773,"425":-0.10732875779461173,"426":0.018728233951186606,"427":-0.03237864624047505,"428":0.14735038630770045,"429":0.026183200528025332,"430":0.034218777675622994,"431":-0.09962931536319591,"432":-0.02160805118894926,"433":0.08341069900434242,"434":-0.12482584623114477,"435":-0.21355770973693358,"436":-0.24319837839961247,"437":-0.0596581501453821,"438":-0.025316748547654158,"439":0.18611875747611595,"440":-0.16123973465494895,"441":-0.018497385338639694,"442":-0.11815409763062402,"443":-0.058317338718401286,"444":0.1963421087590584,"445":-0.12913382224248224,"446":-0.06288106098018523,"447":0.18920206972653147,"448":-0.06127510262039433,"449":0.026136586487319754,"450":-0.1318783591837657,"451":0.22299684555536572,"452":0.11192696183322255,"453":0.1920379299332614,"454":-0.09482379990733908,"455":0.17374876506464015,"456":0.1997795402143697,"457":0.11204755873717417,"458":0.20259223602751178,"459":0.11128422465117521,"460":-0.1806082310089295,"461":0.20577675574500764,"462":-0.15904770044186692,"463":-0.12902184287699506,"464":-0.0324252460882668,"465":-0.12049304799186887,"466":-0.16816205617331054,"467":0.09283188526640318,"468":0.008856331568538317,"469":0.21714605370046036,"470":0.07100201810887821,"471":0.23996053968552453,"472":-0.16051604169859476,"473":0.2571796737014295,"474":0.13246898713920885,"475":0.06923642629270498,"476":-0.13335242485173876,"477":0.1471070322424022,"478":-0.08040190073085898,"479":0.08669478046599863,"480":0.02539539722743952,"481":-0.1006561255591656,"482":0.11112473041079947,"483":0.0045452787141188255,"484":-0.050880571618812355,"485":-0.06054729935056917,"486":0.1908897690729951,"487":-0.0654950674103622,"488":-0.1283774675278484,"489":0.03817710163129763,"490":-0.1803395293176286,"491":-0.02277968896092344,"492":-0.0960792354395177,"493":-0.09499733369151739,"494":0.011320541038083685,"495":-0.033105279024103706,"496":-0.06293844593168343,"497":0.1320122706154202,"498":-0.08826729940757486,"499":0.16825020506121238,"500":0.1360881757697222,"501":0.10175377162293124,"502":0.044267854763216284,"503":-0.04932748084096055,"504":0.07909645355763384,"505":-0.1995208130476961,"506":0.15166214808996328,"507":-0.04163440714784333,"508":0.11791605207907097,"509":-0.09146284973261597,"510":0.11566470337612522,"511":-0.04521500633993379,"512":0.012286429111494539,"513":0.1335787429310757,"514":0.04997499674913043,"515":0.12853170585490212,"516":0.034276817349825954,"517":-0.14549030420631964,"518":0.17737620546545704,"519":0.0016420708602193996,"520":0.16856412779057792,"521":0.09268348734593063,"522":-0.10058986783674378,"523":0.04802786572702979,"524":0.21470086878158365,"525":-0.0722365527518749,"526":0.17690575594626942,"527":-0.0981066555206898,"528":0.020569341474228262,"529":-0.2945580689684455,"530":0.17017859723114578,"531":-0.1355346407178485,"532":0.006573661385435439,"533":0.12788508267939788,"534":-0.05287927008320942,"535":-0.11762049634583882,"536":0.12812897726694272,"537":0.03159538689115823,"538":0.21848917991725406,"539":-0.09533521188385909,"540":0.016761369672762677,"541":-0.11489950998969013,"542":-0.09541525859601831,"543":-0.13502545823861228,"544":0.14515792960363028,"545":0.041576145666008,"546":0.16730907778218862,"547":0.0990425640899063,"548":0.15061731100279602,"549":-0.016867483443842878,"550":-0.06972420382707706,"551":0.13620515432087255,"552":-0.16813420267205334,"553":-0.12922742012617153,"554":-0.12831861560811592,"555":-0.07926211811312744,"556":-0.08839870478503618,"557":0.007644641232273395,"558":0.020784848327181353,"559":0.08600431586965049,"560":-0.21188288751343995,"561":-0.006575329790284536,"562":-0.12586389784707644,"563":0.20297321889079678,"564":0.08797642093038306,"565":0.13832162569545933,"566":0.09758310644646602,"567":0.015948143036224733,"568":-0.0392936083489053,"569":-0.19448260107288656,"570":0.12318395305440115,"571":0.17510282769019173,"572":-0.16550708033502384,"573":0.16095074823958894,"574":0.1321239911914632,"575":0.20091933110576335,"576":0.0412928261644007,"577":-0.18577304369595277,"578":-0.04888278814089846,"579":0.12730284773282843,"580":0.13965555556956963,"581":0.16060925087552544,"582":-0.08964556922820036,"583":-0.08764357186444581,"584":-0.10166482796966116,"585":0.03446051032453161,"586":-0.10666418208466247,"587":-0.14663392853643026,"588":0.14196247867190023,"589":0.16184811109492753,"590":0.005957038413003863,"591":0.2406505538603239,"592":0.008916242125397676,"593":-0.1264149153050935,"594":-0.045192037396883905,"595":-0.21482958187701573,"596":-0.05903263978908894,"597":-0.10044385079079811,"598":0.06484002662501503,"599":0.11405895547355639,"600":0.12167671589054152,"601":-0.047827450556808586,"602":0.12552322208225813,"603":-0.12826659384279102,"604":-0.20043520472581802,"605":-0.015272011662760442,"606":0.03730572539366339,"607":-0.11582347879853856,"608":-0.03985036699264361,"609":0.09416974390565057,"610":-0.10778485691993345,"611":0.010700101744825257,"612":-0.07989701573308537,"613":0.19968042215801404,"614":0.0930781106534912,"615":-0.11528637460702344,"616":0.1741155944578208,"617":0.0056742489072786,"618":-0.09251681060007917,"619":-0.11527019078366324,"620":0.010629640404318269,"621":0.1926431173600253,"622":-0.07221689158157009,"623":-0.1371187002717733,"624":-0.04182500624113428,"625":-0.022110566089909047,"626":0.18336139793049333,"627":0.06383291042144659,"628":0.13905936019835186,"629":-0.025983187083843385,"630":0.1309157510266905,"631":-0.12874591920132797,"632":-0.015357837301099662,"633":-0.0013766087249959616,"634":-0.06518282162749539,"635":-0.07821093857936764,"636":0.04514508601414107,"637":0.1557162984834893,"638":-0.02863895301757285,"639":0.13835612699926195,"640":-0.14866658917361777,"641":-0.11972211952819017,"642":-0.09568080779151694,"643":-0.1323355232019788,"644":0.18619571511243205,"645":0.17782764157590622,"646":-0.04206644459377954,"647":0.07596361411514353,"648":-0.0004979660265139129,"649":0.18304700305371466,"650":0.016626085486062637,"651":0.1941581200492604,"652":-0.0570643878249534,"653":-0.20741750928018912,"654":0.10893396485781598,"655":0.01469692475098295,"656":0.018166258304926786,"657":0.01146403146973161,"658":0.062481191585160155,"659":-0.18814061116583913,"660":0.06578614924213809,"661":-0.16952762392510104,"662":0.09346591975881305,"663":0.08836846178186963,"664":0.18723134854408158,"665":0.18398530699461693,"666":-0.08914421196405206,"667":0.180319900359059,"668":-0.10077576796634356,"669":0.13364263410720598,"670":-0.06387427889925086,"671":-0.0010371122409419686,"672":0.11114572092569412,"673":-0.11827426740302228,"674":-0.0840952173546416,"675":0.042510076293257724,"676":-0.13351679587854345,"677":0.10702158168046988,"678":0.10393463837371326,"679":0.019939784663629743,"680":0.13689978592294247,"681":0.09347345753194392,"682":0.1024576352578886,"683":-0.10992236058032559,"684":-0.22346356280379348,"685":0.06609034847100417,"686":0.18264601705826644,"687":0.04494470272875027,"688":0.09867056483411643,"689":-0.150023415356966,"690":0.07127217156897425,"691":0.008839176814688626,"692":0.20119685736252094,"693":0.1831747718025003,"694":0.09810414894517759,"695":0.04641893936078703,"696":-0.22232657881775036,"697":-0.09754652944371195,"698":0.05831661292336717,"699":0.10233965079166372,"700":0.0785754986699699,"701":-0.11802804437428718,"702":0.1798135315665993,"703":-0.14408301849197172,"704":0.2063656280988862,"705":0.21036259117965844,"706":-0.0871842235692115,"707":0.13688773313970157,"708":-0.09664356025762878,"709":-0.13082544259349155,"710":-0.050163800164833176,"711":0.042113829354383646,"712":-0.11862813986590431,"713":-0.3021372076398043,"714":0.21799193775933437,"715":-0.11583600863545714,"716":-0.10345090499035384,"717":0.18269339780315777,"718":0.1962442421831904,"719":0.0612881935393607,"720":0.0092150769522431,"721":0.05590416348056813,"722":-0.10256987659755584,"723":0.12538228452136235,"724":0.0923735089578669,"725":0.01200892386254729,"726":0.09941897631843058,"727":0.07288758402288988,"728":-0.20553150631467662,"729":0.23384954841376923,"730":-0.03174720464269122,"731":-0.06891387622208285,"732":-0.035034362007311595,"733":-0.05340761338838833,"734":0.1285044058825342,"735":-0.02954230776378224,"736":-0.14531002720287392,"737":-0.10557567339795786,"738":0.10070853652632972,"739":-0.026958508632580314,"740":0.08220874133405863,"741":-0.015386386327154004,"742":-0.11943534463236997,"743":0.10563415108667311,"744":0.18484324570635846,"745":0.02527719394585037,"746":0.14253930475651122,"747":0.03674085708148174,"748":-0.04425097482940493,"749":0.16550015510212837,"750":-0.18910963250472804,"751":0.029103341541772545,"752":-0.10545301711134707,"753":-0.021795855832420868,"754":0.11790783017997077,"755":-0.16131084613892432,"756":0.052224617162564206,"757":0.011713529236974832,"758":-0.07457588166923752,"759":0.07167370166657132,"760":-0.11712200120684407,"761":0.20385846054371423,"762":-0.09695953348022694,"763":-0.1908374454938839,"764":-0.006074018419700611,"765":0.02299654473207632,"766":0.06786282055767033,"767":-0.0595060529795246,"768":0.16585911534544281,"769":0.05551573301556566,"770":-0.15352376963768552,"771":0.08445524230846711,"772":-0.03424449108276272,"773":0.18331934976213396,"774":-0.1501644752406765,"775":0.14218340909731209,"776":-0.13987637256129726,"777":0.06067289772072158,"778":0.029914361373496144,"779":0.17677634808104795,"780":0.24923470347752724,"781":0.12976189564174273,"782":0.10876394271718055,"783":0.05639913376305372,"784":0.12854313108801707,"785":-0.05877983077764519,"786":-0.07338356705811153,"787":-0.17955499565001082,"788":0.0060025325350566506,"789":0.23463020278129723,"790":-0.12254351269725716,"791":-0.06820791995132869,"792":0.07699980707809713,"793":0.15727316601944094,"794":0.2556752398250883,"795":0.20124849002066114,"796":-0.007207600529950717,"797":0.07147810767184264,"798":0.01218140257551334,"799":-0.19206422320303934,"800":-0.09573199521642578,"801":-0.08603061019643445,"802":0.07725937592210146,"803":0.07986553971853155,"804":-0.16574900361637518,"805":-0.1499147449754137,"806":-0.12417965665155975,"807":0.0997176393222077,"808":0.2353174843846028,"809":-0.04739947022719087,"810":-0.18969993971111848,"811":-0.07545012297938535,"812":0.1484331689669715,"813":0.06742608285790737,"814":-0.11766112653360843,"815":0.010438622006015955,"816":0.06898999585344093,"817":0.013744330098127235,"818":-0.10720683129863443,"819":-0.010730673248335395,"820":0.02065471853838767,"821":-0.16562029737525466,"822":-0.19771750233352145,"823":0.024639798589670525,"824":-0.0022815403274596036,"825":0.06988854972340307,"826":0.18658102095570753,"827":-0.17775473853886703,"828":-0.18270137878962853,"829":0.15976177573216307,"830":0.10723671165657363,"831":0.032377706369555566,"832":-0.11526271455717814,"833":-0.0328246505132244,"834":0.17458563198892477,"835":-0.032897713103995974,"836":-0.09320745805397064,"837":0.17313508211855366,"838":-0.18442281461587962,"839":-0.04700644934589004,"840":-0.22895358777052616,"841":0.11194288995203239,"842":0.1921927030463339,"843":0.1626911652320561,"844":0.11827098243275186,"845":0.06651554941280219,"846":-0.16033447479441845,"847":-0.10183330103906314,"848":-0.1326404663344201,"849":0.10565881506761515,"850":0.1984058639453031,"851":-0.15517956435019412,"852":-0.09244136121880181,"853":0.12132639948409253,"854":-0.10204366383179009,"855":-0.12319900518873031,"856":0.10240090676018412,"857":0.10396964001176802,"858":-0.04606232430914443,"859":-0.1393137742211472,"860":-0.10194947284246639,"861":-0.09534231769214827,"862":0.10355076546681992,"863":-0.18258444759670997,"864":-0.16174738742895436,"865":0.027259480333909458,"866":-0.12722644337086042,"867":0.06807256893107186,"868":-0.12019894054755395,"869":0.1000191693618506,"870":0.05552591059393862,"871":-0.14904857341189087,"872":0.07023963113594345,"873":-0.04124866957486283,"874":0.13795832092276294,"875":-0.19823108554620883,"876":0.03430959015445662,"877":0.032407994887036835,"878":0.22393709398358067,"879":-0.052404857815808815,"880":0.06839931687950093,"881":0.14223616524989013,"882":-0.17597929063166257,"883":-0.1499661608587511,"884":0.23333371275364193,"885":-0.12824125699907463,"886":-0.010652244625503921,"887":-0.2328751708669285,"888":-0.02129196562804596,"889":-0.0026826714171999627,"890":0.014238680440082052,"891":0.13345439429177203,"892":0.06441615933483963,"893":0.06323005928794569,"894":0.20773625667922477,"895":0.12065852318831992,"896":0.17788026597578338,"897":0.07919676901551569,"898":0.1697402451049391,"899":-0.006506560973730277,"900":0.1591856722273409,"901":0.16373392803929548,"902":0.0389541476055736,"903":0.055237112432897625,"904":-0.14532967174118355,"905":-0.08241409970683039,"906":0.05183561413411474,"907":-0.10720281030858925,"908":-0.23960792232411043,"909":0.022212792529917806,"910":-0.07351049334688173,"911":0.02866010856737059,"912":0.12722690022012054,"913":-0.16693705271597722,"914":-0.03198297288909232,"915":0.13025389399930978,"916":-0.13884048423595532,"917":0.11504657559954436,"918":-0.017596158385081898,"919":-0.030196767783823797,"920":-0.14277747167430688,"921":0.1130974096141011,"922":0.21080004115697687,"923":0.17392339913049992,"924":-0.058973760243704404,"925":-0.04655197538015688,"926":0.02641894341892093,"927":-0.018318698781897385,"928":-0.03404004320879581,"929":0.13322028996280835,"930":0.10275158203280403,"931":-0.065979459773626,"932":-0.09163791201467815,"933":0.18136556555165337,"934":0.06798482842692731,"935":0.15417197146992584,"936":-0.11957131880388201,"937":0.20101492792964745,"938":0.12539036481500487,"939":0.20805117539988696,"940":0.06868077962407311,"941":0.2662008845189579,"942":0.1447321969029171,"943":-0.20473706048177137,"944":-0.15109912697469818,"945":0.156520544494346,"946":-0.07596443661662237,"947":-0.07092523764891105,"948":-0.12959482964614277,"949":-0.0764080256300539,"950":0.12540879116189133,"951":-0.0017020270749329657,"952":-0.01834344516921396,"953":-0.15772428189126467,"954":-0.22124525027606268,"955":-0.19169305366463205,"956":0.09007272549017775,"957":0.23465897957891102,"958":-0.08975718092789513,"959":0.05945239068884693,"960":-0.1410158422823773,"961":-0.1297811501780265,"962":-0.011595203233487087,"963":0.20430282017128684,"964":0.13736665341401275,"965":-0.01515252142083489,"966":0.12574984531407835,"967":-0.13445880453389916,"968":-0.006561783165361492,"969":0.23778264140355368,"970":-0.025259615971703658,"971":0.08673394101320878,"972":-0.04707648027724765,"973":-0.04640885539591924,"974":-0.0687888798352536,"975":0.07313577287360344,"976":-0.042740137569644655,"977":0.013972289573851954,"978":-0.12724034136690177,"979":0.05387506121318851,"980":0.12037671718850064,"981":-0.16170774234415633,"982":-0.10640464042671698,"983":-0.10006479824657916,"984":0.07732665841847215,"985":0.1229466601299478,"986":0.011427213926345674,"987":0.2473173943618727,"988":0.04777990666126995,"989":-0.10940923474681297,"990":0.09252200624300785,"991":-0.12592474751189256,"992":-0.007106753307212941,"993":-0.149641639609014,"994":-0.11075892808200005,"995":-0.14173480489152745,"996":0.026982109437279477,"997":0.04374584011273706,"998":-0.11108301269432644,"999":0.08907545643174512,"1000":-0.0981109429043379,"1001":-0.09564883968560119,"1002":0.09064668213680835,"1003":0.015360152194850245,"1004":0.12961279171440546,"1005":-0.03871914849300107,"1006":-0.13867162540893313,"1007":-0.07924519047031443,"1008":-0.16559849097007726,"1009":0.12266474203135609,"1010":0.14793714701775007,"1011":0.21327891534207477,"1012":-0.06291014784029555,"1013":-0.1768409012343179,"1014":0.1004776301057043,"1015":0.1193262926368691,"1016":0.05955484512042922,"1017":-0.004142072582057659,"1018":-0.11476297348093949,"1019":0.0708144862740333,"1020":-0.17344975449820157,"1021":-0.10619055891720422,"1022":0.09834248450763884,"1023":0.12176915269751101,"1024":0.060318285762848825,"1025":-0.012681477386401515,"1026":-0.1415717137023933,"1027":-0.11311118888488889,"1028":0.021768990030726375,"1029":0.015276853408620594,"1030":0.13135206195278173,"1031":0.07970633363096105,"1032":0.028966878419807655,"1033":-0.045640412535204185,"1034":0.0047871688377291955,"1035":0.17442515558267171,"1036":0.1683614767145714,"1037":-0.18587517981591856,"1038":0.0316601592277151,"1039":0.1290652001630289,"1040":0.15283110857540927,"1041":-0.12986367552645348,"1042":-0.06079769613389555,"1043":-0.22356111028629888,"1044":-0.12233579379074883,"1045":-0.10431922886479861,"1046":0.04143313902855184,"1047":-0.1378028757167087,"1048":-0.0721265967309639,"1049":-0.19618938637437705,"1050":0.07738450392431208,"1051":-0.13852779898513812,"1052":0.06919668188698881,"1053":0.2329240009166173,"1054":-0.04323661563463088,"1055":0.15956850406872114,"1056":-0.18505542452065618,"1057":-0.039776830737962586,"1058":0.19449901125679345,"1059":0.1699358334243823,"1060":0.09709236100845439,"1061":0.1284481160920578,"1062":0.12054120172331029,"1063":0.15517532885071106,"1064":-0.039086999135802956,"1065":-0.03343569989817096,"1066":0.11965514308445374,"1067":0.10404422974343647,"1068":-0.08856263751751167,"1069":-0.0320529099041035,"1070":0.031670610675415496,"1071":-0.14515623265127842,"1072":0.016935356333297152,"1073":-0.027946092716041277,"1074":0.06270939647229644,"1075":0.13862457456340316,"1076":-0.05445457755810747,"1077":0.17892921842786694,"1078":0.10299342018164832,"1079":0.04186707238924036,"1080":-0.10580322352876216,"1081":0.03331249778333434,"1082":-0.22760031028828268,"1083":0.19060689801211517,"1084":0.010718389948879966,"1085":-0.10226816449197657,"1086":-0.08600251004064273,"1087":0.019480366097894535,"1088":0.0875729221108285,"1089":0.028469985725074524,"1090":0.10158214865710272,"1091":-0.0849458089303936,"1092":-0.01585386007980984,"1093":0.04535118214720221,"1094":0.09105979462984738,"1095":-0.006907711809570292,"1096":0.1480188444774281,"1097":-0.1718987757664823,"1098":0.06324621828672258,"1099":-0.14570187272531535,"1100":-0.019469932609184074,"1101":0.08802621575925296,"1102":-0.0461374868895652,"1103":0.1585032532704455,"1104":-0.0940930940589012,"1105":0.17507922468766327,"1106":0.13994441101945868,"1107":0.030853443822701696,"1108":-0.07571836160424594,"1109":0.14569032445917254,"1110":-0.25199166197652956,"1111":-0.15473552175973165,"1112":-0.11219196604323554,"1113":-0.04858173979606525,"1114":0.14347257776213238,"1115":-0.17209923166905525,"1116":-0.07168716611102952,"1117":-0.06768544920977225,"1118":-0.08712640646128769,"1119":0.11919303677884292,"1120":0.007574551771874956,"1121":-0.11719405745184452,"1122":-0.15301374904733808,"1123":0.028609090245327286,"1124":-0.11111033669889069,"1125":0.12266309016804654,"1126":0.1362016543755319,"1127":-0.2307192008747514,"1128":-0.1494434456571025,"1129":0.053021585570935476,"1130":-0.02788647502255322,"1131":-0.08543591348996316,"1132":-0.025142518993070878,"1133":-0.09039160163224867,"1134":-0.20866321486390535,"1135":0.0903507865985412,"1136":-0.17238459388624017,"1137":0.06785361626189039,"1138":-0.05535518592639713,"1139":0.1500666556948569,"1140":-0.2393893294630886,"1141":0.11594845684527219,"1142":0.1352935690828718,"1143":-0.010111422712133335,"1144":-0.042041807457065726,"1145":-0.20712108001054164,"1146":0.0027604666985386653,"1147":-0.017436394204876384,"1148":-0.15767730863716042,"1149":0.025447731523382883,"1150":-0.09155457057708324,"1151":-0.160026892549788,"1152":-0.17787901455244157,"1153":-0.016603029798898175,"1154":-0.02361564960665768,"1155":0.2181689009865598,"1156":0.16732691716371095,"1157":-0.06388428009242479,"1158":-0.040932129046397356,"1159":-0.11522287114625589,"1160":-0.04346413243353697,"1161":0.1522728952175293,"1162":0.18709990921506073,"1163":0.09717963091247048,"1164":-0.036255805874037456,"1165":-0.10660937110571286,"1166":-0.021215102011682047,"1167":0.01474031797024211,"1168":-0.07396506182978181,"1169":0.18940312368392076,"1170":0.027073900854109333,"1171":-0.1722653807656224,"1172":0.16515728054779527,"1173":-0.09970037104771087,"1174":0.042744538713761895,"1175":-0.032664357474998774}},"6":{"bias":-0.05401594394516596,"weights":{"0":0.013123432523725286,"1":-0.019375001311554698,"2":0.10186601449638681,"3":-0.0375757786399732,"4":0.12207847493359421,"5":-0.019906034330478727,"6":-0.059697884984289885,"7":-0.10691539929531069,"8":-0.013333261649326751,"9":0.10688373136548998,"10":-0.19181025925083675,"11":-0.012022198331156446,"12":0.015560698003017645,"13":0.012381981443142683,"14":0.12008067116911408,"15":0.06684582158875162,"16":-0.06690759780730143,"17":0.14829832918875485,"18":-0.049662190306029814,"19":0.13265065947515678,"20":0.2210466020765393,"21":0.09135889254645593,"22":-0.027041600876022184,"23":-0.15864852620516878,"24":-0.002274390567760513,"25":0.1656376826565965,"26":-0.09068924446071949,"27":0.08492402127177738,"28":0.08382593781616234,"29":0.14028296119550465,"30":-0.08461333758511716,"31":0.07675205188879158,"32":-0.049163566345124816,"33":0.10822365774231896,"34":0.10393852177021598,"35":-0.15937393008738512,"36":0.11964302150882616,"37":0.14036850996883393,"38":0.27320773824113714,"39":-0.23758742282836415,"40":0.10218756828579488,"41":0.0741930607569095,"42":0.12366054723309523,"43":0.1550125014004006,"44":0.27432495483110403,"45":-0.13061872098677424,"46":0.0868038644254314,"47":0.07186602830793794,"48":-0.011090875676973103,"49":-0.17092435149931454,"50":-0.12798601378424443,"51":0.11171384125235785,"52":0.11771504094428996,"53":-0.14766642440321587,"54":-0.09028302068026114,"55":-0.1251813700118332,"56":0.05403425873281467,"57":-0.042100580584850764,"58":-0.051155635939417396,"59":-0.0845337752725217,"60":-0.13085336256526126,"61":-0.1460577416156531,"62":0.015348449294294603,"63":-0.049640179875869696,"64":-0.03760475853310079,"65":0.07264932076928868,"66":0.10976977319319306,"67":-0.021360948158607593,"68":-0.06744615187814418,"69":0.07936336313625071,"70":-0.20961987516229927,"71":0.12974407475497643,"72":-0.0008469508278097993,"73":0.08617528551148017,"74":0.23317552072661796,"75":-0.08271905072004973,"76":-0.16659449636667095,"77":-0.08223920628943167,"78":0.09575080865420922,"79":0.11918959011867705,"80":0.13276608688100797,"81":-0.0010327966189501876,"82":-0.15219565922145104,"83":0.07772600420748003,"84":-0.11125625448659682,"85":0.17376692279768216,"86":-0.04568036951734467,"87":-0.16511126921233812,"88":-0.09103077005335412,"89":-0.02043364723941942,"90":-0.11813483978096252,"91":-0.05679067164878248,"92":-0.1206003656565438,"93":0.12340215083022456,"94":-0.09708089362776004,"95":-0.03617740721262505,"96":0.1748351252741257,"97":0.18034106489717908,"98":-0.011165458218881385,"99":-0.16518983141985843,"100":-0.1997067607947441,"101":-0.04759893301940256,"102":0.2629189139449205,"103":0.18825361596934814,"104":-0.01310668610453115,"105":0.03395614234793899,"106":-0.18237596227806577,"107":0.13251972959229116,"108":0.01378060595816928,"109":-0.16723016370964044,"110":-0.09805225402356499,"111":0.11243255260557007,"112":-0.14741219854180398,"113":-0.07916786735826788,"114":0.15616092400947273,"115":-0.21199496879929616,"116":-0.049448689571551595,"117":0.0024027869913961636,"118":0.19479804056092268,"119":-0.0017547532505872941,"120":0.03980119490774783,"121":-0.00021619419493459585,"122":0.04935484923621746,"123":0.14073873616457072,"124":0.07451285697421951,"125":-0.053195220801634586,"126":-0.1601158420276055,"127":-0.04975897041503791,"128":-0.1664638614255525,"129":-0.11596414070445597,"130":-0.09380964272369442,"131":0.00040443626572169117,"132":0.03158934079641994,"133":-0.13986014601688884,"134":-0.0316886227807638,"135":0.12888108676589596,"136":0.0263499416529652,"137":0.1142271446328875,"138":0.1972941041021284,"139":-0.0685686896521273,"140":0.13300202071220438,"141":-0.07918487766090714,"142":0.20517570237191612,"143":-0.02063675353285879,"144":-0.039443412790989285,"145":0.0165278456802053,"146":-0.11385481608434588,"147":-0.10369627240340759,"148":-0.2142133258824566,"149":0.09240577977990284,"150":0.15978345945863406,"151":0.11992085088720673,"152":0.1890018366562163,"153":0.11599805717587795,"154":-0.00967976054908055,"155":0.11484783989671629,"156":-0.1147525416606119,"157":0.058094579167163526,"158":0.10189832195770225,"159":-0.005435523498651739,"160":-0.10000926569487151,"161":-0.13011117051664378,"162":0.18933784200170262,"163":0.03906257574179873,"164":0.18392410981633678,"165":0.04113199695888031,"166":-0.14500405306068645,"167":0.11055046258152895,"168":-0.008782113399862696,"169":0.15553917694254735,"170":-0.17626477875227872,"171":-0.21424252824993395,"172":-0.1225187806830034,"173":0.14473177704308107,"174":-0.08167122581000347,"175":0.04133712911291645,"176":0.15475223994118026,"177":-0.25535380121384355,"178":-0.13366915950787953,"179":-0.1568162945416778,"180":-0.1745842636604566,"181":0.0076631442703942185,"182":-0.1593063415889807,"183":-0.15884385327362746,"184":0.12046055401316245,"185":-0.23097218469864153,"186":-0.10448438670598553,"187":0.13712211010781644,"188":-0.04919392315831775,"189":-0.021964610872549476,"190":-0.04189367414804014,"191":-0.04749994331258803,"192":-0.0690672926896432,"193":0.21811253378220596,"194":-0.01125491043304858,"195":-0.1454776622337579,"196":0.06892136342474853,"197":0.09157061403539682,"198":0.05999998626159693,"199":0.1387489245486039,"200":0.21535278800978988,"201":0.11188234405124804,"202":-0.2461982617575231,"203":0.07186478544463312,"204":0.08114992693216584,"205":0.03999640365222577,"206":0.11661143702658194,"207":0.012949173827420035,"208":-0.04740602431444892,"209":-0.24024240833087804,"210":-0.1711229416499574,"211":0.11865459619382228,"212":0.03982176332963468,"213":-0.18470031390835964,"214":0.05751119493803966,"215":-0.1855216229513395,"216":-0.2157601776076046,"217":0.13691928857749458,"218":0.23198367352941707,"219":0.16204496243231362,"220":0.13313319651385597,"221":-0.046599711850128116,"222":-0.1812550093185403,"223":-0.06800312275007883,"224":0.17273341633408512,"225":-0.1417952386276127,"226":0.1168858873666219,"227":-0.14448110607344086,"228":0.07368075064704252,"229":-0.13231533383992605,"230":-0.12343605847659729,"231":-0.12163509893535303,"232":0.05615902469760674,"233":-0.22725982201257938,"234":-0.25025681336739974,"235":-0.03690569907347443,"236":0.016254123649491033,"237":0.08879530069877647,"238":-0.03692708607649677,"239":-0.20977487612596218,"240":0.08841492931875834,"241":0.13017997432669842,"242":0.19084156655771262,"243":0.1764502739981112,"244":0.11407751799961481,"245":0.012269307994538816,"246":-0.035093849321744405,"247":-0.01937775808631221,"248":0.15292641380606206,"249":0.015793980084094418,"250":-0.0645919373314994,"251":0.05191886978944801,"252":-0.30095691030586513,"253":-0.08955180210545736,"254":-0.1354730879226475,"255":-0.12354193311812861,"256":0.004381193072782309,"257":-0.014699178830077306,"258":-0.06200337927016013,"259":-0.03397079987743067,"260":-0.06064904969930046,"261":-0.16934932965753063,"262":-0.02484684216783444,"263":-0.15288243224521073,"264":-0.03709142574756131,"265":-0.02482872513692734,"266":-0.1938762531646278,"267":-0.08435773779609328,"268":0.11986909292454292,"269":0.07292469434892246,"270":-0.029140782035740682,"271":-0.14913383132320093,"272":0.07027324726187997,"273":-0.05124129480008069,"274":0.1627159374445755,"275":0.04923257244810828,"276":-0.0666299828544048,"277":-0.05713423299508629,"278":0.060903139533127995,"279":-0.10470794973750609,"280":0.05013778377187353,"281":0.05627893373276434,"282":-0.1173460343976604,"283":-0.21284934910960468,"284":-0.12066202749850899,"285":0.016776396329962893,"286":0.12496657054194243,"287":0.10327063479994193,"288":-0.19293765900757232,"289":-0.1254916081219847,"290":0.12714533799703928,"291":-0.1330052561380924,"292":0.03477495506116708,"293":-0.11124053160924585,"294":-0.05242652474809912,"295":0.1139795854166276,"296":0.10544303770794652,"297":0.1393553720160541,"298":-0.07421989557177013,"299":-0.100583235220784,"300":0.09836161425328346,"301":0.06061243474239216,"302":0.09998850897552726,"303":0.14732695559856696,"304":0.2655623397829729,"305":0.006670497037307362,"306":-0.2092868942017473,"307":0.046781529544402754,"308":-0.18470229881751837,"309":-0.16795720892869057,"310":0.1832055623041419,"311":-0.046053888256663324,"312":0.18964883496224869,"313":-0.07762442569796116,"314":0.10929427289606569,"315":0.029506059408504544,"316":-0.00983403809630419,"317":-0.15229268056847,"318":0.13550430450326217,"319":0.11873614871425534,"320":-0.022412375280603452,"321":-0.10017750754737728,"322":-0.21838699285889768,"323":-0.19012905824865675,"324":0.12549941110472612,"325":-0.15583857390563602,"326":-0.08533052023006803,"327":-0.03430124306284756,"328":0.1546942279990903,"329":0.1998511657644911,"330":-0.18531458504066325,"331":-0.030730922399317056,"332":-0.13794626131491394,"333":-0.03337188998815488,"334":-0.09735764996993815,"335":-0.03867076494398584,"336":0.1858089689856543,"337":0.028455909498736703,"338":-0.1742092020411722,"339":0.1172262441603171,"340":0.11995202811651048,"341":-0.07670297028966257,"342":-0.07616949216091437,"343":0.029773999162286936,"344":0.09133318961905693,"345":0.09837599516924975,"346":0.02902862248815173,"347":0.09352028170567502,"348":0.11335855804721638,"349":0.13463201062803815,"350":-0.21631339151116896,"351":-0.2362754776411926,"352":-0.02279198428314969,"353":0.049544054513356424,"354":-0.013685183766512345,"355":0.23125375417526225,"356":-0.12341014744118103,"357":-0.13447426260559509,"358":-0.14124221174315335,"359":0.17239292761257394,"360":-0.03457303333997676,"361":0.1654127694373187,"362":0.17575633472828578,"363":-0.10365582479379853,"364":0.1447797584735761,"365":-0.22371990875971376,"366":0.03235239186916656,"367":-0.08323835113498347,"368":-0.10741261776038981,"369":-0.08113304600440005,"370":0.08675930311456512,"371":0.050987130836130275,"372":-0.12815620946808842,"373":0.019175416623810962,"374":-0.07068664533835682,"375":-0.1269983102420253,"376":0.04053535984801812,"377":0.12435974028877014,"378":-0.16432512759940818,"379":-0.07494743307897338,"380":-0.05090691232283502,"381":-0.0017871431751532735,"382":-0.06988226632048633,"383":0.08829811153049869,"384":-0.21108643773744404,"385":-0.03920031636591434,"386":0.06011559750507309,"387":-0.04477225029019129,"388":-0.029379059099393163,"389":-0.12224544687866863,"390":-0.040443509482480995,"391":0.191249846236395,"392":0.1945437915435134,"393":-0.0433451685557748,"394":-0.1941305543704067,"395":0.17913287347750861,"396":-0.10434367720930003,"397":0.1946162144763068,"398":-0.1497141672125914,"399":-0.03516504130070289,"400":0.026410712081182668,"401":0.04464612370188717,"402":0.04917038280256591,"403":0.16271497485329042,"404":0.07945288874464707,"405":-0.07857955979753267,"406":-0.09639822377530265,"407":-0.11202044616024476,"408":0.08182363411334372,"409":0.052543571415157204,"410":0.08226538130661597,"411":-0.16432679483650148,"412":-0.1550525476872978,"413":-0.01315772098727556,"414":-0.14720436499172979,"415":-0.224945177237494,"416":-0.012529803143760867,"417":-0.001425064205854183,"418":-0.013496397835276966,"419":0.15277577489512753,"420":-0.029043317070975627,"421":-0.14344310451363435,"422":-0.06877416150119438,"423":0.12379434956918194,"424":0.10036961285744125,"425":0.06471267690797963,"426":-0.05960160536444557,"427":0.09298992061093536,"428":0.17064432969740345,"429":0.055056488432286214,"430":0.031292658483678064,"431":-0.001972796496103873,"432":-0.06783444070973471,"433":-0.19894339215578025,"434":-0.1741126363590469,"435":0.10826862998112942,"436":-0.015161478717846299,"437":-0.1310409764689403,"438":-0.01771329426353654,"439":0.1142426522760163,"440":-0.2029140020473042,"441":0.006139801062513119,"442":0.07909991801775647,"443":0.10069584706977283,"444":-0.13976299625334224,"445":0.11772664024667438,"446":0.057719459750431114,"447":0.057911941989783035,"448":-0.18819161350693162,"449":-0.18090885931793252,"450":0.08720578250500559,"451":0.13337141370580732,"452":0.08835749437288593,"453":-0.17256386368859228,"454":0.10357411309498464,"455":-0.2219797497476681,"456":-0.06694241030512466,"457":0.06137532177116993,"458":0.14044845829182898,"459":0.13068941997696426,"460":0.051607268443404054,"461":-0.17502953545581523,"462":-0.15663684019054672,"463":-0.09944381368652644,"464":-0.006194203395181631,"465":0.11891206885575889,"466":0.008779374267084415,"467":0.15038723502989165,"468":0.11116623444943495,"469":-0.057765807302399774,"470":0.11160110185503848,"471":0.07806233311129966,"472":0.06356743909625949,"473":-0.1365377841321369,"474":-0.14293754120064367,"475":0.06997652599900209,"476":0.011550458706455368,"477":0.10045109424350225,"478":-0.10487920004755098,"479":0.13418668096868597,"480":0.07740015793264976,"481":-0.11167219643312451,"482":-0.14285916897272988,"483":0.05367773597383374,"484":-0.02566093843379754,"485":0.1328125834086884,"486":-0.12383457579937743,"487":0.1842741369195317,"488":0.07364887541227629,"489":-0.08972726883211803,"490":-0.058005166138801995,"491":-0.06418504379765962,"492":0.00008430169008874416,"493":0.08739711142389955,"494":-0.04699422547378257,"495":-0.08838180719842226,"496":0.20592824045335742,"497":-0.028180464544178378,"498":-0.18972780312431062,"499":0.07802773638478128,"500":-0.12925317104746428,"501":-0.16022392554987006,"502":-0.06745566724433023,"503":-0.05408386698413714,"504":-0.07679694673345662,"505":0.29008511402959514,"506":-0.03800976566143835,"507":-0.01353727870119322,"508":0.010760188203612268,"509":-0.06300596038953446,"510":-0.005643027794277547,"511":-0.05484804198327406,"512":0.01499121173247097,"513":0.14038727566144696,"514":-0.16531560443121976,"515":0.09021580725793119,"516":0.13835801498420233,"517":0.23505146898819135,"518":0.13982517043295237,"519":-0.01993070168015889,"520":-0.06125416347834739,"521":0.0076582228339504,"522":-0.09716826884319363,"523":0.06871001893506574,"524":-0.041678420602381645,"525":0.11874215864066283,"526":-0.12215904781713598,"527":-0.18200758424397698,"528":-0.01919702959868287,"529":0.05974141491294088,"530":-0.06896525393535861,"531":-0.21120575275796702,"532":-0.16729427112579603,"533":0.0174843301277009,"534":-0.19336354215639107,"535":-0.18456763550888639,"536":-0.10035265039143555,"537":0.06504023484417128,"538":0.0670688711632383,"539":0.06824109278856501,"540":0.17845328206061137,"541":0.03216212856406256,"542":0.023985672863583975,"543":-0.18707009947238926,"544":0.05196042271526587,"545":0.14189612825123069,"546":-0.2043370905421579,"547":-0.09440304995735999,"548":-0.2069397407516949,"549":0.04659357825942872,"550":0.106682343754007,"551":0.01705435512443394,"552":0.07725095384841296,"553":-0.05137908888876265,"554":-0.10504729779885102,"555":0.057206151051134815,"556":0.17151404743843038,"557":-0.12044362762346682,"558":-0.17936279498943353,"559":-0.08535988638417176,"560":0.14534322583307552,"561":-0.06353808209011297,"562":-0.1227034826815996,"563":0.15839271453969592,"564":-0.0442118305358918,"565":0.08076175540301625,"566":0.04016426843967229,"567":0.1254272943312164,"568":-0.17474486614794668,"569":-0.0716141349616917,"570":0.040866200524605586,"571":-0.06558600492551525,"572":-0.18312969410550822,"573":0.01173254806305019,"574":0.1391895182968006,"575":0.008159201916787385,"576":-0.03369226957045446,"577":0.043062657826988884,"578":0.013803586226400539,"579":-0.10074296480444088,"580":-0.03287164364597357,"581":-0.17726085240650974,"582":-0.1479772869404195,"583":0.062462460150100686,"584":0.19136063525169186,"585":0.1689274224358109,"586":-0.1170980040767668,"587":0.14988709712963477,"588":-0.1428841174193106,"589":-0.12914549694920388,"590":0.15515738956897557,"591":-0.2764495069011016,"592":-0.10525770201153603,"593":-0.16513623132188096,"594":-0.09063147276690546,"595":0.05236129214290234,"596":-0.07988300717811199,"597":-0.1737655593528471,"598":0.0029209765562528203,"599":-0.07813268708221695,"600":0.018360543103494477,"601":-0.10646915596395183,"602":-0.208205336444012,"603":0.05226242844095248,"604":0.07108144466111753,"605":-0.06539592185425501,"606":-0.03024959179818159,"607":0.005509400005009072,"608":-0.03119251981357299,"609":-0.044815248768413855,"610":0.07813684241340628,"611":0.08268178154838653,"612":-0.03672911965725778,"613":0.10108985637169345,"614":0.07246892832485788,"615":-0.0729645707168334,"616":0.13365372796900618,"617":-0.16850283558320056,"618":0.21851990507644703,"619":0.17671475886386037,"620":-0.17969289654876272,"621":-0.24476760463382,"622":-0.17112533466563043,"623":-0.16809786509813038,"624":-0.03225734961691798,"625":-0.08730719306323319,"626":0.0676119319225765,"627":-0.09550404019022708,"628":-0.13894983998207458,"629":-0.2008170437653111,"630":-0.1798958355471609,"631":-0.09384025808576127,"632":0.14630770075766136,"633":-0.2381214234972499,"634":-0.03743853441003697,"635":0.05494973307797294,"636":0.008484907724556292,"637":-0.12824819356366296,"638":-0.09858133591910904,"639":-0.2070129940896363,"640":0.06361733957374228,"641":0.1310383231657229,"642":0.037345917315853065,"643":-0.18590469390882122,"644":0.13303188352720355,"645":0.10258928563653291,"646":-0.05702312345123941,"647":0.020577026820080425,"648":0.11640943593201965,"649":-0.18351558486842734,"650":-0.03357044907306786,"651":-0.053319204585879625,"652":0.0447421474593167,"653":0.09187545238275208,"654":-0.03905808242164051,"655":0.16280373422637678,"656":0.020287795556140863,"657":0.07506836874300855,"658":0.12019473305127715,"659":0.13047417310674966,"660":-0.1403125454309691,"661":0.1634533419119649,"662":-0.20731932141709938,"663":0.1495521701026888,"664":0.004438457597309689,"665":0.0683584636788028,"666":0.16331453948825675,"667":0.024473759840056928,"668":-0.17267552572971956,"669":-0.15935609338363435,"670":-0.14478170875279675,"671":-0.19063173063531133,"672":-0.03067350777949394,"673":0.07365255576256073,"674":0.05788949716852688,"675":0.041669355427610376,"676":0.06951055069223516,"677":-0.10481678615605393,"678":0.049013174580175047,"679":0.08250545993832084,"680":-0.006119607064825873,"681":0.11831425934889563,"682":-0.008343121759985426,"683":-0.12628013222513607,"684":0.03200790073725224,"685":-0.0921430725970554,"686":-0.12470099376924276,"687":-0.0573387489526486,"688":-0.02547125497092205,"689":-0.11035745527482312,"690":0.14895472738303417,"691":0.003836178855489089,"692":-0.20299472444369945,"693":0.14341183287727324,"694":-0.14960019123974733,"695":0.09117403044010927,"696":0.06733621896112657,"697":0.11852617051392428,"698":0.006145464634809608,"699":-0.08324501156079092,"700":-0.16611456754050308,"701":-0.11744886715266464,"702":0.15100341425465552,"703":-0.1798388109203727,"704":-0.2516050894577655,"705":-0.2806454204445438,"706":0.04727936756830482,"707":-0.019861192030524607,"708":0.057685495201271156,"709":0.18102936935330863,"710":0.09237212902567733,"711":-0.17817239116485867,"712":0.1593221531390466,"713":0.23239027889384445,"714":0.04691760341439123,"715":0.0641373894828738,"716":-0.15905731634045833,"717":-0.22702463763197966,"718":-0.040181357072346394,"719":-0.07076893317014755,"720":-0.12739662637650953,"721":0.09525049375567361,"722":0.11791937090518957,"723":-0.12094267465512379,"724":0.08215319985624352,"725":0.24687935073001074,"726":-0.12772453416386445,"727":0.1578319558046187,"728":-0.008750179212899297,"729":-0.17898161683883954,"730":-0.12602956876941887,"731":0.17968139604541356,"732":0.09743124332974024,"733":0.04636581398106773,"734":0.11809481248180285,"735":0.15162899280767408,"736":-0.0389937306342834,"737":0.16122052069507162,"738":-0.05531137026822815,"739":-0.10716175354888716,"740":0.0745780438858123,"741":-0.013297033682543605,"742":-0.17413137658105038,"743":-0.12244557563923733,"744":0.09511756493181739,"745":-0.029018694481671648,"746":-0.13710425004454813,"747":0.08477540449678753,"748":-0.09986386983064999,"749":-0.18453276011780873,"750":0.03006686265424336,"751":0.06533212925494669,"752":0.05782289494334683,"753":-0.12493651687818683,"754":-0.06971241804747136,"755":-0.014715614134340957,"756":-0.0033583249567427777,"757":-0.09673660507508593,"758":0.15096383618558012,"759":0.1408139483016368,"760":0.0690598981965224,"761":-0.015358498693030638,"762":0.020717160397617843,"763":-0.04475798425733438,"764":-0.15749860779403846,"765":-0.2405478940599668,"766":0.15795114498976903,"767":-0.20793667132594368,"768":-0.026312475780780623,"769":0.02914270144464572,"770":0.08325042306387792,"771":-0.1512869831066181,"772":-0.13673615596479313,"773":0.05195460496084212,"774":-0.15543947070451616,"775":0.1486852840096423,"776":0.04870026659659893,"777":-0.12361880344627735,"778":0.12623862655951215,"779":-0.1399969053067357,"780":-0.02579289793718864,"781":0.07165609631315549,"782":-0.045247201495456954,"783":-0.22438636168307072,"784":0.017612196693683323,"785":-0.16600848380709954,"786":0.10324891677457984,"787":0.15875730674034666,"788":0.14402925832212915,"789":-0.13406533021738884,"790":-0.12402994992184135,"791":-0.13068307155231176,"792":0.006379303946347147,"793":0.1437266225933935,"794":-0.2108281042940382,"795":-0.10235286873407545,"796":-0.15848797281401197,"797":-0.2361333512758516,"798":0.0026229376622266495,"799":0.002807087718712984,"800":-0.0772568564211784,"801":-0.0017328877313529014,"802":-0.019212402002037245,"803":0.19560389019211918,"804":0.16498722073239253,"805":-0.10230743427528431,"806":-0.15734599149013975,"807":-0.253012192511731,"808":-0.025494801406103832,"809":-0.161828637710858,"810":-0.056484332879288154,"811":0.1800049709361605,"812":0.03681714373468401,"813":0.06718598836878086,"814":-0.005117751756154095,"815":-0.13885049796742943,"816":0.018315564466915915,"817":0.10822761520153007,"818":-0.02326289895263414,"819":-0.11660230034597364,"820":-0.009852874688619676,"821":-0.07890463751184322,"822":0.027450142324222063,"823":0.13378246914179284,"824":-0.06877467707233448,"825":-0.05683478215268262,"826":0.12084647393845191,"827":-0.1855064788582881,"828":0.15497059607678362,"829":0.028678011614405356,"830":-0.0376220460442483,"831":-0.1449441447306408,"832":-0.08572749551831751,"833":0.1465096809252631,"834":-0.04848830764231246,"835":0.06145236981379294,"836":0.037789717987680736,"837":-0.13504499017493835,"838":0.08494067430274763,"839":0.19040053918657224,"840":-0.07843433799497652,"841":-0.0003622095702134338,"842":-0.05488374101298683,"843":-0.06707399914399421,"844":0.09752062697838643,"845":-0.04308592171379602,"846":-0.17639256827808492,"847":-0.06234612059881747,"848":-0.041944223062968654,"849":-0.08432127385142485,"850":-0.04687712455464933,"851":0.018169571482694807,"852":0.06336672341388733,"853":0.04336798707558602,"854":-0.089473572807598,"855":-0.20107858948311305,"856":-0.14195355740210533,"857":0.07528234039979279,"858":0.00376470634800775,"859":-0.22599788980824176,"860":-0.03958074225257076,"861":-0.09424033240100883,"862":0.0213344321763397,"863":0.1282916139172704,"864":0.0681546513370787,"865":0.014531236586221602,"866":0.0342203880620442,"867":0.041604405700740595,"868":-0.04551342421372518,"869":-0.04054895316192263,"870":0.08205517528208808,"871":0.09347994056224701,"872":0.09841571086721486,"873":-0.2268699940969787,"874":0.03724650361669946,"875":0.1568876290417526,"876":0.04063879705516704,"877":-0.03394330430675473,"878":0.12901619160408045,"879":-0.15452699933179695,"880":0.1830322890019508,"881":0.1761273765370801,"882":-0.03632627247897333,"883":0.10044223266502485,"884":0.09315936100238519,"885":-0.02277479218729266,"886":-0.07464571765410725,"887":-0.11220375360942933,"888":0.1311913696142805,"889":-0.0886453191910856,"890":-0.204957378704878,"891":-0.08191444709024377,"892":-0.018145923618562793,"893":0.00008111948527032685,"894":-0.13530252482436705,"895":-0.1843680162042315,"896":-0.13140624255544023,"897":-0.10028160958943842,"898":-0.2156109560467333,"899":-0.21701487125828708,"900":0.19554029163309328,"901":0.1057147261460888,"902":-0.1350648412156997,"903":-0.16690341416586696,"904":-0.08501479950843388,"905":0.2722059040799936,"906":-0.07424547700795463,"907":-0.1742782794560324,"908":0.05618966151344046,"909":0.0832555964891431,"910":0.05638744472711024,"911":0.025324975471025607,"912":-0.11464475751506414,"913":-0.18073652799145615,"914":-0.11753594676394581,"915":0.1073159117498378,"916":0.1339348897193312,"917":-0.03257869876864698,"918":-0.15893930470608275,"919":-0.06222212085216364,"920":-0.11542982617705677,"921":0.10446659394917389,"922":0.06113882029563186,"923":-0.04181358321467672,"924":0.018897316049890044,"925":-0.005377036198821775,"926":0.09727268283943977,"927":0.2104075956747644,"928":0.028282247321984103,"929":0.02984420987767813,"930":0.2000419065093926,"931":0.04268220254648685,"932":-0.05109811170568884,"933":-0.009163076468381244,"934":-0.051730613767293335,"935":-0.09455746182499399,"936":-0.10657972468478451,"937":-0.20381352036177808,"938":-0.07046729986841233,"939":-0.15728604931959775,"940":0.08522709690391544,"941":-0.12022195995498877,"942":0.10008984619324772,"943":-0.05886610671127741,"944":0.17092353438111937,"945":0.0980371657737332,"946":-0.1682424094019823,"947":0.043971282660154806,"948":0.11122951294771682,"949":-0.15793907629611284,"950":-0.14913792583465932,"951":-0.11160635630023985,"952":0.011882384052384627,"953":-0.061263838511680054,"954":0.053030139221530444,"955":0.21981313322925478,"956":-0.11831767673498945,"957":-0.15617192699452287,"958":0.15983040565829956,"959":0.17064749194606224,"960":0.01707047480663251,"961":0.1838169664062193,"962":-0.16406148720246067,"963":-0.21644099200535452,"964":0.10803179588709175,"965":-0.08538754724416665,"966":-0.16437476881925894,"967":-0.1606395709115251,"968":0.009475693001852366,"969":-0.035943394355532,"970":-0.12689388047681208,"971":0.15297133192884654,"972":0.13405213345615258,"973":0.13513236480756702,"974":-0.11916627151704454,"975":-0.018435737249035473,"976":0.08793617071803342,"977":-0.16027269312519407,"978":-0.042457591791365615,"979":0.19577470098719674,"980":0.1684666426016764,"981":-0.1615264458539793,"982":0.018604402453818634,"983":-0.054280109915022134,"984":0.09257906300815694,"985":0.12893599885520995,"986":0.013865264373833537,"987":0.06782793705730526,"988":0.04086885142913225,"989":-0.18765633600961398,"990":-0.07576637672676058,"991":0.18564687030898636,"992":0.026469298124515456,"993":-0.2184176313250449,"994":0.11514934541054368,"995":-0.1493250633642744,"996":0.23269945688500504,"997":0.010097873997336386,"998":0.10012346265987458,"999":-0.099986642813928,"1000":0.05031695860286161,"1001":-0.1817083633763577,"1002":0.047819360119127574,"1003":0.07633576798652679,"1004":0.05292467524990699,"1005":-0.03017199044321555,"1006":0.03389827306548364,"1007":-0.2100383445537597,"1008":-0.06507629533349327,"1009":-0.17716292495572172,"1010":0.13706580099860996,"1011":0.010608434350653726,"1012":0.05700023478312407,"1013":0.07632549222610972,"1014":-0.06550563321173816,"1015":-0.06723716997987389,"1016":0.06178784069461332,"1017":-0.03777513109848424,"1018":-0.13138657165914097,"1019":0.02370040020381637,"1020":0.03609959974336897,"1021":0.16919799723070106,"1022":-0.1887340261389831,"1023":0.029189767477990597,"1024":0.054198516145277945,"1025":-0.14783153486157635,"1026":-0.10956832899264485,"1027":0.12003328743953726,"1028":-0.06517550678182503,"1029":0.10461993729986302,"1030":0.10694207436450687,"1031":0.024875602734350993,"1032":-0.16524488568686352,"1033":-0.028075116841798784,"1034":-0.18001678013528172,"1035":-0.18650570014863155,"1036":0.1954865377059754,"1037":0.18838667971960843,"1038":0.1511790270617508,"1039":0.05234021030924463,"1040":-0.013715671491424908,"1041":0.06779692652543542,"1042":-0.006768771261983892,"1043":-0.014565121292546609,"1044":-0.08804543227964032,"1045":-0.0199355969527259,"1046":-0.011860805601904428,"1047":0.1593482033145844,"1048":-0.170813944642212,"1049":-0.04697217720821312,"1050":0.21219328461038683,"1051":0.12814954662116326,"1052":0.07303340553374536,"1053":-0.005394896243724487,"1054":-0.06327917080100343,"1055":0.15489046157583952,"1056":0.13159756929823152,"1057":0.0024950409393954282,"1058":0.1550721771712973,"1059":-0.18623937986077446,"1060":0.0831838865568863,"1061":0.030109382804629176,"1062":0.08248371703311051,"1063":-0.07252814241167328,"1064":-0.06894743646601356,"1065":0.08456103634304415,"1066":-0.07500285112945822,"1067":-0.022663370664387675,"1068":-0.0023199655207707,"1069":0.01040438124127294,"1070":0.14986645653247166,"1071":-0.05599926929201561,"1072":0.03891747929608435,"1073":-0.09764984430335708,"1074":0.0444027580157392,"1075":-0.13533065625451252,"1076":-0.20742421318745383,"1077":-0.006344304328469814,"1078":0.13465662375573584,"1079":-0.020212873157045036,"1080":-0.22713281570896893,"1081":-0.07125648430014361,"1082":-0.17237217671968064,"1083":-0.04486862109454431,"1084":-0.15428867669275315,"1085":-0.10821840638566771,"1086":-0.16536488209170988,"1087":0.1842555049362134,"1088":0.042837015035349216,"1089":-0.11731393595343086,"1090":-0.09835458183363331,"1091":0.13167051560126386,"1092":-0.1432023994869358,"1093":0.03758822066248366,"1094":-0.013469584531328996,"1095":0.15839469095745093,"1096":-0.011357692403425575,"1097":0.10636854331607748,"1098":0.1633297559366347,"1099":0.13485761043311897,"1100":-0.18277994691184832,"1101":0.11417827068119824,"1102":-0.13824561581771957,"1103":-0.0564868856852852,"1104":0.04215612589317716,"1105":-0.18736051197351714,"1106":-0.1740332960552666,"1107":-0.1308635394573324,"1108":0.12091218539203386,"1109":-0.08905992517834001,"1110":0.22627802574637085,"1111":0.08756756990963468,"1112":-0.049162428912733126,"1113":-0.19663705749073912,"1114":0.030503820106744586,"1115":0.03903136478486429,"1116":-0.004106480469349194,"1117":0.06811860011693462,"1118":-0.029740983803930282,"1119":0.030075739396521983,"1120":0.04767161631514575,"1121":0.09212100298262792,"1122":0.21995860210838056,"1123":-0.0193938876224854,"1124":-0.13673175740815127,"1125":-0.16385969027753622,"1126":-0.0681578038887144,"1127":0.016549700715910488,"1128":-0.07189495155542783,"1129":-0.030299443826471872,"1130":0.016760709773392828,"1131":-0.19528135894755794,"1132":-0.03695488256046783,"1133":-0.017747720167095367,"1134":0.13507499727438754,"1135":0.06448529943334048,"1136":0.046681436691931366,"1137":-0.205640952034046,"1138":-0.04088356613861649,"1139":0.07966712103045447,"1140":0.2849199940103289,"1141":0.2091117216585035,"1142":-0.005842001225208834,"1143":-0.011073875337070509,"1144":0.1865070239230201,"1145":-0.04963228561520977,"1146":0.05369036231710289,"1147":0.029899620370519304,"1148":0.19730869597744355,"1149":-0.007322843014169095,"1150":-0.15660085671610535,"1151":-0.09847434913743762,"1152":-0.13144640501927843,"1153":-0.08811765729052469,"1154":0.07690318074842006,"1155":-0.21208927815667905,"1156":-0.017524675213511483,"1157":0.12267312203095826,"1158":0.18271890009443575,"1159":0.11236712549516534,"1160":-0.05767965974573055,"1161":-0.1945556146100001,"1162":-0.20564091895651873,"1163":-0.015780210659647957,"1164":0.12953425754501335,"1165":-0.020968944159957943,"1166":-0.1132004747410618,"1167":-0.10388925567744772,"1168":-0.1993487951964255,"1169":0.161625333096036,"1170":0.14914571144480684,"1171":-0.08649138459358079,"1172":-0.14116339093461702,"1173":0.11739559205037492,"1174":0.1441247610791494,"1175":0.0390986191130523}},"7":{"bias":-0.1255724199795099,"weights":{"0":0.20075237556847658,"1":0.039501394094838174,"2":0.010934348941383228,"3":-0.08870424289755618,"4":-0.012481966349407356,"5":-0.16371344874181856,"6":-0.21422192140907959,"7":0.02793570741208631,"8":0.16673643391064658,"9":-0.049494887599670266,"10":-0.0487766501538843,"11":-0.12632933201050522,"12":0.11135901586082791,"13":0.0104923920179571,"14":-0.055296650412492356,"15":0.1400746322379915,"16":-0.13982003851853064,"17":0.06217358366652718,"18":-0.03949558489716875,"19":0.11544311586679629,"20":-0.029014703958854898,"21":-0.0831028730316432,"22":-0.16342576068746953,"23":-0.10172532262715087,"24":-0.1569748316771989,"25":-0.029596146320592945,"26":0.15313779336806213,"27":-0.023258448332810225,"28":-0.02186489482577801,"29":-0.12182731202872299,"30":-0.044539397145404745,"31":-0.1297007678934625,"32":-0.058092738919468055,"33":-0.14298254059630486,"34":-0.18139647011692092,"35":-0.12137440199772104,"36":-0.06833166239174016,"37":-0.05895500561307735,"38":-0.10466218813186637,"39":0.11701647132146921,"40":0.06221122334456492,"41":-0.20467741517269974,"42":0.1403144294245473,"43":-0.07442744653776887,"44":-0.05226438586569961,"45":0.02316058055076076,"46":-0.07324130278201169,"47":-0.1817046023702534,"48":-0.15919106831867696,"49":-0.173168974535859,"50":-0.07713469209114104,"51":-0.15774493213681962,"52":0.061896169165647004,"53":0.06318856699025222,"54":-0.07548475901598595,"55":0.03378933010323457,"56":-0.13109917748316527,"57":-0.03401835872707068,"58":0.07560074352173587,"59":-0.08716208749698713,"60":-0.2174320162463431,"61":0.1641879068347034,"62":0.06694532559079872,"63":-0.1318832785828351,"64":-0.06310609987093752,"65":-0.04200118745047578,"66":0.12679367596761357,"67":-0.10401212217570147,"68":-0.14958236897136643,"69":0.023556528433897234,"70":-0.03847041741036936,"71":0.1221070784035896,"72":-0.17671327383434735,"73":0.10416905097959826,"74":0.2415596642522377,"75":-0.07522551245611461,"76":0.07221661880886951,"77":0.04246189739996652,"78":0.11080994240218592,"79":0.12707332663311716,"80":-0.011214722319413745,"81":0.1333472381159167,"82":-0.15772201082821968,"83":0.1873497077539306,"84":0.06263387755563646,"85":0.03158304493809997,"86":-0.06272961956888047,"87":-0.10247413428161464,"88":0.13936978392224475,"89":-0.027672797570974815,"90":0.16124580153260323,"91":0.15939151147196554,"92":0.08039644681790183,"93":-0.19005701111728784,"94":0.18499153294583381,"95":-0.15209751428848134,"96":0.18019242455058312,"97":-0.0032470948377289048,"98":-0.09100145973473928,"99":0.03746403089456954,"100":0.06859234197019475,"101":0.07290186046442296,"102":0.12321777266700153,"103":0.18319479204136266,"104":-0.03550314378996428,"105":-0.021389679909204932,"106":-0.18765700689613787,"107":0.17934917077075813,"108":0.066084731639388,"109":-0.22936185700795736,"110":-0.20714502148334593,"111":0.10283969078525053,"112":0.04208079327029796,"113":0.04286055972404951,"114":-0.10607586428543435,"115":-0.21198186201813443,"116":0.126890856878019,"117":-0.20400255320691094,"118":0.22964180843180504,"119":-0.07426428786017063,"120":-0.11590831773865347,"121":-0.016893751966557683,"122":0.07996674685916678,"123":0.12766430199639506,"124":-0.16514093387272558,"125":0.08597914458096409,"126":0.10683471046705074,"127":0.06957684066370574,"128":0.10173477909739227,"129":0.19274544568871815,"130":-0.1666081395874798,"131":0.08712270238963006,"132":-0.051251561321470955,"133":0.15964714685725145,"134":0.09959998601208772,"135":-0.03980548531992019,"136":0.211435283426606,"137":0.18633047862631794,"138":0.0005934379940883724,"139":-0.03698226217887282,"140":-0.004293057399970554,"141":-0.0960938384841386,"142":-0.1045350627338377,"143":0.14154798102578633,"144":0.06818694118276565,"145":-0.014395663206470214,"146":0.030579745593860837,"147":0.0022295379731941153,"148":0.15734418376662793,"149":-0.21529804090302146,"150":0.0953392658949649,"151":-0.027220429696101184,"152":0.13499760183804516,"153":0.1805881332210921,"154":0.14590779650010222,"155":-0.2099716669381715,"156":0.09931382151453237,"157":0.06097760861105962,"158":-0.12759180628103078,"159":-0.05645968285645732,"160":0.06440158331581841,"161":0.0397325097320188,"162":-0.09592791166135489,"163":-0.032737892361348817,"164":0.17538986436948126,"165":-0.043499498930676,"166":-0.12452050974456247,"167":0.1734966972517948,"168":0.1659462184875517,"169":-0.024829579649756545,"170":-0.005141634176251301,"171":0.12278304471724483,"172":0.16951608010476035,"173":0.04877821465423103,"174":-0.004604416705524218,"175":-0.028012987176820173,"176":0.14307536482392716,"177":-0.12156077553829153,"178":-0.1530866718829998,"179":-0.1426989902411308,"180":0.05899076352939023,"181":0.15910393497558578,"182":-0.035704984497845836,"183":-0.1604728684002456,"184":0.148306927319613,"185":0.027440092944028296,"186":-0.09300381162612316,"187":0.06492482693989228,"188":-0.06341353886847183,"189":0.0742250896767966,"190":0.1077589408089892,"191":0.029378320994805716,"192":0.13718720735463624,"193":0.2144520009359262,"194":0.24718360324045785,"195":-0.05971604851128205,"196":-0.02981494994199561,"197":-0.1490367805084387,"198":-0.001549818652425438,"199":0.11874959007220291,"200":0.1428321886204653,"201":-0.016401631123523108,"202":0.018611725772031847,"203":-0.1841948508660553,"204":-0.0718978348974836,"205":0.2636885798751044,"206":-0.08354825210748897,"207":-0.1981464666292265,"208":-0.06393268043505293,"209":-0.11099655796133316,"210":0.11305569783807654,"211":-0.045861495656077764,"212":0.14617262863894784,"213":-0.019377213582555106,"214":0.08506932812587144,"215":-0.21858835465404983,"216":0.0624998038968874,"217":0.01896034040778075,"218":0.29146981684770423,"219":0.19992919641003487,"220":-0.05577169973166294,"221":-0.13556721158088847,"222":-0.02524263598925016,"223":-0.16065125565363558,"224":0.1739077967823036,"225":0.1332929591272217,"226":-0.11786336598193792,"227":-0.10816690900297621,"228":-0.17910211807762758,"229":-0.01512048153080012,"230":0.17404899013203862,"231":0.12542313489745482,"232":-0.07774105104792217,"233":-0.1020391857218877,"234":0.08201700085896087,"235":0.09359527744502923,"236":-0.119027771085494,"237":-0.04555768766878272,"238":-0.18377004901461838,"239":0.03634712350460512,"240":-0.17807980506461113,"241":-0.11557694281234902,"242":0.01096948746141128,"243":-0.17061203172655198,"244":0.12007394260285413,"245":-0.07463946481745311,"246":0.04915623226194413,"247":-0.12783415004941243,"248":0.1302345517907797,"249":0.14985120263138424,"250":-0.04028570691861751,"251":0.1196738895383075,"252":-0.18198097677559605,"253":0.16180551794101283,"254":-0.12541724677263685,"255":-0.10564611060273621,"256":0.1494403173516042,"257":-0.09091122075763111,"258":-0.046186523026601964,"259":0.038448978453555833,"260":-0.14056359228164658,"261":-0.06230574110016424,"262":0.05332817353373378,"263":-0.06500684826477261,"264":-0.18471223807236614,"265":-0.08080968380510731,"266":-0.062216036120974004,"267":0.10553201934657434,"268":-0.018781741167463104,"269":0.021325353858246174,"270":0.015785016387289123,"271":0.012246865107541787,"272":-0.0851943398740925,"273":-0.03694101457059892,"274":0.11696092396824238,"275":-0.10326725827511019,"276":-0.24096006635411765,"277":-0.11782078717262694,"278":-0.05540286443805992,"279":0.08296392456438118,"280":-0.12938022319130532,"281":0.056061172449398185,"282":-0.16617907623634368,"283":-0.2244264601613067,"284":-0.09662472049970842,"285":-0.09210074823219769,"286":0.1128008642472771,"287":-0.011575310572375146,"288":0.1821599177963855,"289":0.09584664295615955,"290":-0.15740572020300364,"291":0.09322574092428809,"292":0.17607905037091495,"293":-0.15368721763441218,"294":0.12865470725124525,"295":0.041853341595501706,"296":0.12348346201045479,"297":-0.20510925388482476,"298":0.08044044758328919,"299":-0.1547713797721593,"300":0.0676564086266721,"301":-0.18415043375537976,"302":0.10436517132532706,"303":0.08027448994196196,"304":-0.07531151631486838,"305":-0.1357873163097128,"306":-0.0034986839077210657,"307":-0.10106788558176362,"308":-0.030553150038837885,"309":0.13013416016970436,"310":-0.06837847936304786,"311":-0.1588892303665627,"312":0.08540755326545732,"313":0.17297502318963484,"314":0.11004791690175475,"315":-0.18209456758970144,"316":0.02396454995185138,"317":0.11899342003728941,"318":-0.09467097707135733,"319":-0.10379806684040657,"320":-0.15159222420062735,"321":-0.025724887772465965,"322":-0.20653442858494497,"323":-0.059309944665803034,"324":-0.03189159796116715,"325":0.18788753420858348,"326":-0.1987501851398488,"327":-0.230512126929149,"328":0.14731734126799625,"329":0.19937859167992966,"330":-0.18854551236052378,"331":-0.052415833585532166,"332":-0.018202254624860928,"333":-0.15819710843334703,"334":0.15736485398216382,"335":0.0068996273924675075,"336":0.14770251987430855,"337":0.05184912175220008,"338":-0.0844474955162662,"339":-0.06955605856440157,"340":0.15884496102354997,"341":-0.06596764537379736,"342":0.09943273181961498,"343":-0.11428545129223652,"344":-0.06545227255346461,"345":0.13413760155921814,"346":-0.13969171534476055,"347":-0.07686456959357502,"348":0.10217927985836625,"349":-0.025611055724234808,"350":-0.10794767902695208,"351":-0.2015721040566829,"352":-0.021522949876486255,"353":0.03197752252165392,"354":-0.019431995043234406,"355":-0.10907892016375127,"356":-0.12289990276659656,"357":0.15330241968149919,"358":0.14712665395309363,"359":0.1510410244869017,"360":0.09353228254857239,"361":0.12322745067938817,"362":-0.15923094798206797,"363":0.07532205659959981,"364":0.06701428707195317,"365":0.10217181905267132,"366":-0.1660020380513734,"367":-0.1481645635529891,"368":0.02521667103065628,"369":0.11455743788406911,"370":-0.058654599430076754,"371":0.13186372028893256,"372":-0.013732059555092819,"373":-0.019582317171356507,"374":0.07695180709052847,"375":0.14912653546062118,"376":-0.19468334030786466,"377":-0.08334562894995404,"378":-0.12000032504397917,"379":0.05230532594395566,"380":0.11212820417242547,"381":-0.05389201024249054,"382":-0.18342412683653755,"383":-0.166241777657959,"384":-0.11267895006993808,"385":-0.011084896941196952,"386":-0.0968300976670312,"387":-0.06706357425139207,"388":0.06333077166717807,"389":-0.08764789539695869,"390":-0.06258710155014938,"391":-0.09916005019888222,"392":0.1392846086945759,"393":-0.12402561146926468,"394":-0.1177676378196533,"395":0.17532064460619354,"396":0.0007587397924311792,"397":-0.11159321890876651,"398":-0.14958889606538342,"399":0.15328005295023242,"400":-0.05948693735382787,"401":0.05945867210485233,"402":-0.044690789507449535,"403":0.0499406004988487,"404":-0.04595716885293085,"405":0.1548916406327442,"406":0.08564919837529664,"407":-0.1423468825901159,"408":-0.24945707120018573,"409":-0.07351356984770925,"410":0.07035402785333529,"411":-0.16446128523404246,"412":0.07479222688857119,"413":0.12079468745231421,"414":-0.0953596389628841,"415":-0.18296281493186167,"416":-0.035022821169948995,"417":0.04726270992972555,"418":0.19616959566951037,"419":0.16027362233834583,"420":0.08738278139578137,"421":0.13106593201768502,"422":-0.024133401575604507,"423":-0.08190643644637981,"424":-0.11490229349635578,"425":-0.16999107254799395,"426":-0.18618333960617445,"427":-0.05922401026243751,"428":-0.1786794420163705,"429":-0.20832356548880465,"430":0.04586556972462076,"431":-0.11972074585631488,"432":-0.19180736484181715,"433":0.05108872568116543,"434":-0.16360458521942545,"435":-0.0874391114643309,"436":0.12303782570615199,"437":-0.1857828377036911,"438":-0.06883793674396313,"439":-0.020421974103333757,"440":0.1668499083226698,"441":0.10376395302255122,"442":0.25568534980754853,"443":-0.04438340280691384,"444":0.09919059789343411,"445":-0.1713146398567109,"446":-0.20043840927258685,"447":0.13865448147170498,"448":-0.0714376047950383,"449":-0.19539741871172261,"450":-0.1544178690338844,"451":0.05544954853338743,"452":0.0792202722111734,"453":0.12905019588655836,"454":-0.005999699498091889,"455":-0.21642914729671173,"456":-0.10586169454869652,"457":-0.058614303396982766,"458":-0.12258913283382981,"459":0.09705239366392615,"460":-0.06366210527814704,"461":0.048892332804302496,"462":-0.15815666668454254,"463":0.16627485513477186,"464":0.10256133091283799,"465":0.10433087355578521,"466":0.1198284146524083,"467":0.22779563912369766,"468":-0.2025602016257688,"469":-0.20435576085371981,"470":-0.043607984544168366,"471":0.03962909936683477,"472":0.06767324208181845,"473":-0.17714990638084685,"474":0.17893151106821073,"475":0.006658573900650163,"476":-0.13732691200349756,"477":-0.08038897348690509,"478":0.00014241604500689245,"479":0.15868900735653002,"480":-0.11676259684914066,"481":-0.04041032438143325,"482":-0.05086130950472137,"483":-0.2236022730292263,"484":0.24793221182865524,"485":-0.11387907987553544,"486":-0.13825378943992994,"487":0.06760372192773494,"488":0.18717848038236157,"489":-0.16476745280199795,"490":0.15567847759263578,"491":-0.07731311439103095,"492":-0.10072595705627292,"493":-0.11062530617113861,"494":-0.19702775176045045,"495":-0.00908975087717173,"496":-0.052656343647625205,"497":0.12385966604199357,"498":0.1505460062368779,"499":0.11500640282882778,"500":-0.005469896233468063,"501":0.06796428367405793,"502":0.1707389523618722,"503":0.03467873049575343,"504":-0.050323404778629746,"505":0.1975256863280783,"506":0.06632234102483613,"507":-0.19377062035142814,"508":0.020669604789111486,"509":0.19548702432611292,"510":0.15973065322000232,"511":-0.07524677531761939,"512":-0.18305934990434308,"513":0.023689337403358858,"514":-0.17481564111051406,"515":-0.06489314117568189,"516":-0.12808296518886858,"517":-0.08816058975194738,"518":-0.0749101018125841,"519":0.13726135450783533,"520":-0.10066192588635442,"521":-0.15065704304481034,"522":-0.13456388081403495,"523":0.17302247726604048,"524":-0.023358319593934036,"525":-0.22088470577490993,"526":-0.11265994282243408,"527":-0.09272755611194196,"528":0.14184248369713062,"529":0.03302711184082303,"530":0.17397674845466052,"531":-0.09964802037736162,"532":0.04163802428168216,"533":-0.19390713289244882,"534":-0.14603046230413397,"535":0.015389366370498708,"536":0.16472850487022733,"537":-0.031475997497714195,"538":0.036551519070540134,"539":0.12691200457985163,"540":0.1143114345776483,"541":0.20355013467164138,"542":0.18645133855611337,"543":0.02745090090096111,"544":0.00907154678022521,"545":-0.0672370719291043,"546":0.06657226595696163,"547":-0.12207207328916722,"548":0.03106456823849914,"549":-0.14839704087944802,"550":-0.21295985982113091,"551":-0.06873646511795535,"552":0.14504803465581143,"553":-0.08160468099354455,"554":0.1718182215853857,"555":0.029768150188289915,"556":-0.19301980448684006,"557":-0.13968522814416623,"558":-0.08122922076397132,"559":0.03144294757976131,"560":-0.03310195176734226,"561":-0.023586405829433957,"562":-0.12922641347587313,"563":0.16442907366501425,"564":0.17784186272209193,"565":-0.11389975173819135,"566":0.07267213874658807,"567":-0.12819882358023424,"568":-0.1294475428397984,"569":-0.11353446131454215,"570":-0.2230380130511595,"571":-0.17528630888009547,"572":-0.1886367472400432,"573":0.16539194286650827,"574":0.1264818283846138,"575":0.062258691865977156,"576":0.07748139068152175,"577":-0.1365150418760901,"578":-0.03183875168329493,"579":-0.11223870278233346,"580":0.013686852826466804,"581":-0.07229204269432139,"582":-0.06877122040873086,"583":0.046612058153431064,"584":-0.09464981027657682,"585":0.032570138328715664,"586":-0.13345726481018894,"587":0.04698336793883308,"588":-0.07625645883622427,"589":-0.033700097275409964,"590":0.11299536576177222,"591":-0.16695589660281795,"592":0.02102184110202024,"593":0.1402052143622255,"594":0.022917753154068243,"595":0.18718956032576423,"596":-0.06340887594495553,"597":-0.13302252654924132,"598":0.003737549408604817,"599":0.0038498988589723256,"600":0.0864573592408889,"601":0.06392777182315088,"602":0.18636414616416141,"603":-0.13814119043509318,"604":0.1889363193457774,"605":0.07712536091232802,"606":0.1638767477025257,"607":-0.050438055207367376,"608":-0.11370536428269658,"609":-0.0649144464474715,"610":-0.003844393603865578,"611":0.13579161796718714,"612":0.0936683086202869,"613":-0.07701148344304375,"614":0.03012891102927705,"615":-0.08408579582257769,"616":-0.1889638732756616,"617":-0.14728110375604545,"618":-0.0882257295285317,"619":-0.12581714362124577,"620":-0.07353300681055622,"621":-0.05786108282249134,"622":0.11584720130867603,"623":-0.21256203560468306,"624":0.19448414268932737,"625":0.15182925988606522,"626":0.022923606694960408,"627":0.15659763531683232,"628":0.010993818131030396,"629":-0.22534352818349032,"630":-0.12649593362950123,"631":-0.19640541950924045,"632":0.05737573402542944,"633":-0.11276333831628046,"634":0.06039460446432913,"635":0.12707152625662885,"636":0.10534803686711089,"637":0.10698553488025285,"638":-0.14879492388523738,"639":0.13051160183777857,"640":-0.030342487165063794,"641":-0.02891861535957774,"642":-0.022429389871035377,"643":0.0036287401267648786,"644":0.15605470979770045,"645":-0.22384031812925956,"646":-0.07269041752371726,"647":0.11659067989954428,"648":0.15863499008698664,"649":-0.03337224525151785,"650":-0.14872626549183962,"651":-0.18691319060501713,"652":0.21216923614241934,"653":0.17379653697294414,"654":-0.026064331460669853,"655":-0.046759523561255165,"656":0.1561603904805141,"657":-0.05641777667300795,"658":0.08316131207473869,"659":0.17424293387187184,"660":-0.1718314548455374,"661":0.021809965306795204,"662":0.0146971623392306,"663":-0.060834438833902334,"664":0.03542475227649649,"665":-0.03692801279546088,"666":-0.1377082353403372,"667":-0.0016967383401490796,"668":0.012462665566182456,"669":-0.014673657874171511,"670":-0.03425292817945761,"671":-0.15359127322355443,"672":0.040358551267644434,"673":-0.07144196898662195,"674":0.09404132485501039,"675":0.09438958613401413,"676":-0.008849702189540232,"677":0.20803775840507696,"678":0.054293429109873136,"679":0.10260226409203227,"680":-0.15284999242718675,"681":-0.0825406066836444,"682":-0.11059146569883439,"683":0.07677909492345483,"684":-0.09283053730387195,"685":0.08583497119503361,"686":-0.005853281909599135,"687":-0.0973679861722485,"688":-0.001723449588088067,"689":0.03993323710730919,"690":0.11188800630996174,"691":-0.10008317916737755,"692":-0.1639034143739022,"693":0.0869281098942658,"694":0.14746063218911737,"695":-0.10499596193153768,"696":0.11092748491173991,"697":-0.03350193076253911,"698":-0.07751730219774611,"699":0.0505365284409882,"700":-0.019378271269094614,"701":0.04931306241626981,"702":0.05433785469987232,"703":0.18169450183463123,"704":0.13619621523689243,"705":-0.043708314081536144,"706":-0.07550021891120089,"707":0.04433306816682762,"708":0.04251767357766537,"709":-0.1877526112610122,"710":-0.07485613646148198,"711":0.0738769543554828,"712":-0.06299289955954085,"713":-0.05212174792606701,"714":0.08990695288999227,"715":0.0071252871564927,"716":0.17976675651547816,"717":-0.2297233357854548,"718":-0.06020832352419394,"719":-0.08339395625676821,"720":0.19046500975928876,"721":0.18459056574419355,"722":-0.005630519672793026,"723":0.027063808785180422,"724":-0.10046142683628075,"725":-0.1499972250994118,"726":0.14353749882861372,"727":0.08013497169149146,"728":-0.0426336175195171,"729":-0.011988223387111136,"730":0.12098520042827868,"731":0.04242831211526529,"732":0.019590364002349404,"733":-0.0760890785519267,"734":0.1642053236068428,"735":0.04270023644929468,"736":-0.09016335586091487,"737":0.24089874461470925,"738":0.11161107857266167,"739":-0.05028749715812616,"740":-0.11145658863427127,"741":-0.22782717394933524,"742":-0.16967628502356713,"743":0.01422208033670741,"744":-0.17056058260371898,"745":0.11863836842779837,"746":0.08235464530787019,"747":0.020841426198777383,"748":0.0387425595515811,"749":-0.02784294328550909,"750":0.011136074974735876,"751":-0.026178733358898355,"752":-0.12973065376307905,"753":0.12421631974132287,"754":0.08851611521221904,"755":0.05858323943756166,"756":-0.2214579584988789,"757":0.07194237158977777,"758":-0.12501384670334156,"759":0.13929932855847818,"760":0.03349941238548191,"761":0.1888684323457937,"762":0.012199975000242155,"763":0.1418354614716123,"764":-0.13315296738204038,"765":0.0006578054439554658,"766":-0.1802858677317063,"767":-0.08673986179871039,"768":-0.01293350536664918,"769":-0.07987013706252953,"770":-0.011032678389461016,"771":-0.06004957320436183,"772":-0.14885531371914895,"773":-0.19077607447729142,"774":0.20578705146060075,"775":0.027680889498122037,"776":0.14042069353531023,"777":-0.21854295678978786,"778":-0.09235845298763767,"779":-0.20197824973456294,"780":-0.02775430016816416,"781":-0.03678820976651456,"782":0.0748743985745846,"783":-0.09191343049156485,"784":-0.0776530366276851,"785":-0.07696495485631462,"786":0.14892915239040672,"787":0.18331926464925713,"788":0.19100817875954854,"789":0.06941823539048797,"790":-0.15218330853231873,"791":-0.15919039621757122,"792":-0.03077007549298927,"793":-0.10582148546699305,"794":0.15660509759218208,"795":-0.10063681969230867,"796":-0.01653232216182248,"797":0.14852438427315157,"798":-0.20236146497155671,"799":0.0347192681446397,"800":-0.06611973656860143,"801":-0.050842478755172345,"802":-0.06014829515594628,"803":-0.12235621676677069,"804":-0.16945870082020267,"805":0.1536378831136175,"806":-0.08194003415014399,"807":-0.034645204680784907,"808":0.1640768861531999,"809":-0.12045692970786069,"810":-0.023522262620561677,"811":-0.1306131885926461,"812":0.21464823767376065,"813":-0.1891422605009984,"814":-0.1531314995576207,"815":0.11393269627344405,"816":0.011857951130220853,"817":-0.0826882515350136,"818":-0.10947560056519383,"819":0.1495378316203817,"820":-0.02033544248514203,"821":-0.047044001933654774,"822":-0.1398637811097167,"823":0.1295441121149244,"824":0.08859953991877446,"825":0.08884706162523849,"826":0.03040822791046582,"827":0.1455754505858285,"828":0.040256878927294626,"829":0.12516059095338075,"830":-0.19851161411759008,"831":0.15465382279513767,"832":0.08567321916034129,"833":-0.07958341360967397,"834":0.1795166613495572,"835":0.12897468914152982,"836":0.1572271220511326,"837":-0.14113005334967005,"838":0.1678003873285554,"839":0.18075837613193557,"840":0.131714726392443,"841":0.12225949522395296,"842":0.16531302719363644,"843":-0.01040362908918239,"844":0.03682175310300632,"845":-0.04309323151461528,"846":0.006402974938076058,"847":-0.10976570059586434,"848":0.004483431872219538,"849":-0.017703535386610365,"850":-0.05234675256365025,"851":-0.1109413071161577,"852":-0.02956755803526539,"853":0.05869694072370312,"854":-0.11106689238634862,"855":-0.18301934867927228,"856":0.11556377735911584,"857":0.2360434606341138,"858":-0.14954657420559173,"859":-0.1148732467361434,"860":-0.14825335514970095,"861":-0.0005195950779744049,"862":0.10467566106045634,"863":-0.13844090616772559,"864":0.22859961867999473,"865":-0.024315587184853726,"866":-0.12894493717377611,"867":-0.19694731374869906,"868":0.14367158489514417,"869":0.059796027936756764,"870":0.031535549146646996,"871":0.006476013882890767,"872":-0.22002736630217357,"873":0.13464371176327428,"874":0.021224355328367507,"875":-0.17778820411611737,"876":-0.1394637178387159,"877":-0.20935125010897285,"878":-0.11507621489426612,"879":-0.06466046535680689,"880":-0.031846488141838436,"881":0.13634648197021032,"882":-0.11604679470430851,"883":-0.18628916825965808,"884":-0.0834835742449532,"885":-0.13462267869505068,"886":-0.170287122173587,"887":-0.0736671658039002,"888":0.1255542673234662,"889":0.08860842864355835,"890":0.04803602865707792,"891":0.0823419134636098,"892":-0.12957683323720687,"893":0.22977062966056733,"894":0.10938106308887051,"895":-0.10345530928272947,"896":0.09522652744061018,"897":-0.0970222555327364,"898":-0.1281859028354158,"899":-0.11298923411995578,"900":0.007550000669035787,"901":-0.11802198774081586,"902":0.007088367361575869,"903":0.03884557370654718,"904":0.034593728168663525,"905":0.1047402361051015,"906":0.035617464445816656,"907":-0.08571293821154377,"908":0.14878214657719013,"909":-0.13412416283206174,"910":0.070627480555854,"911":0.000022434175949235917,"912":0.056200015188593085,"913":-0.006193126610554566,"914":-0.1976332373605696,"915":-0.20332878401834154,"916":0.07916801288599401,"917":-0.05308889370410852,"918":0.00653326389180553,"919":0.016444818300624487,"920":-0.04162544741421314,"921":-0.19574126994834512,"922":-0.1485412727936589,"923":-0.08650691116984259,"924":-0.22872556009286832,"925":-0.13586189774095864,"926":0.20077276370432828,"927":0.2032076870573809,"928":0.06412369869912037,"929":0.006701101831815712,"930":0.12941591890502824,"931":0.14793179588155697,"932":0.186804879122499,"933":0.13018640549862728,"934":-0.11234370821014157,"935":-0.0033479368256047488,"936":-0.2136994723577868,"937":-0.18612695978439897,"938":0.02241931318734051,"939":-0.2046923588065187,"940":0.03685901677150902,"941":-0.23239905212893097,"942":0.03337518529490835,"943":0.20742432666854205,"944":0.07630653306007021,"945":-0.1943285579240636,"946":0.02996260396128229,"947":-0.15200566471140498,"948":-0.16261572844754874,"949":-0.14552808845475915,"950":-0.12233691970503902,"951":-0.13906280420547978,"952":-0.018667761082299544,"953":0.013982479252502135,"954":0.2606965299301293,"955":0.06958790869356915,"956":0.1574718940290212,"957":0.15697023876311736,"958":0.08124528049875931,"959":0.13444631918031147,"960":-0.06410801069667518,"961":0.12144770486007991,"962":0.06188393033261541,"963":0.03341330839484377,"964":-0.16962161766859984,"965":-0.09671092921017056,"966":0.01993701442816481,"967":-0.09412503466854452,"968":-0.0978814358339871,"969":0.0757412208095571,"970":0.16539260533165054,"971":0.18132351033776442,"972":0.04112857717339287,"973":0.1453148503138761,"974":-0.06317498523453723,"975":-0.229671528802557,"976":-0.12978154558461508,"977":0.17870462364878295,"978":0.0009127866209307498,"979":0.049653770548574956,"980":-0.1195230088398947,"981":0.11074707857981499,"982":0.046679659927118984,"983":0.10126524031628859,"984":0.036168652761114146,"985":-0.1540143471007367,"986":0.09213816524665472,"987":0.1058591222058514,"988":0.12431998087184874,"989":-0.022922862362938865,"990":0.09602494236664261,"991":-0.07051029512578015,"992":0.012461196891190043,"993":-0.028057426167154068,"994":-0.02140663616304015,"995":0.07294970980766358,"996":0.15858380907379435,"997":-0.06640899670715811,"998":0.18054753327961948,"999":0.13156816956785333,"1000":0.09650890527336506,"1001":-0.057867653782106794,"1002":-0.03673523986328046,"1003":-0.17865826769916984,"1004":0.05770081027033525,"1005":-0.07048696015644824,"1006":-0.046293269580920504,"1007":0.10383789699837317,"1008":0.060900510333367686,"1009":-0.009322203651668446,"1010":0.06209623448986365,"1011":-0.0635224720782147,"1012":0.20441969937227683,"1013":-0.11665536936561928,"1014":-0.14159019001578127,"1015":-0.00229699487232209,"1016":0.09995919358389363,"1017":-0.10644698143565309,"1018":-0.1103054047355483,"1019":-0.06111634991981217,"1020":0.15086584630362512,"1021":-0.13091045984686578,"1022":0.13304864384294934,"1023":-0.20055471253549897,"1024":0.15530163882629913,"1025":-0.01533993357980676,"1026":-0.05483727860667561,"1027":-0.1987488499071678,"1028":-0.06073391225481862,"1029":0.0039050720620236717,"1030":0.023024941747592505,"1031":-0.17656145471939197,"1032":0.06754746357128914,"1033":-0.06491192740884334,"1034":-0.17337565494124013,"1035":0.07396415486228633,"1036":-0.17787652625686035,"1037":0.10418620980458115,"1038":-0.1207680743913027,"1039":0.14079727715055346,"1040":0.11373717141279753,"1041":-0.06464488859829716,"1042":0.09961822482479255,"1043":-0.03654234537202673,"1044":-0.051298565708483325,"1045":0.17669245279367163,"1046":0.024998899794896414,"1047":0.0447736898671903,"1048":0.049327681477073566,"1049":0.07299225840467631,"1050":0.06932417613979272,"1051":-0.12219457502206346,"1052":-0.006665247919312428,"1053":0.1434925432991117,"1054":0.015668898455837892,"1055":-0.09021521986319807,"1056":-0.17224063286603283,"1057":0.17524645592660673,"1058":-0.12430865853939148,"1059":-0.005971895505646203,"1060":0.03189146456808182,"1061":0.19343640148459684,"1062":0.06445717360074735,"1063":0.10573542951502761,"1064":-0.05743399472777665,"1065":0.030421748572114472,"1066":-0.04269408535642737,"1067":0.174985698054684,"1068":-0.07227938536398963,"1069":0.08330968421556104,"1070":0.06167851993550352,"1071":0.09797756098603372,"1072":-0.10366663040869993,"1073":0.12451752867800034,"1074":-0.16592930958041377,"1075":0.10757683320015461,"1076":-0.1759119829194587,"1077":-0.04649970056634131,"1078":-0.09058030455785603,"1079":-0.11024638270585985,"1080":-0.08588654542191101,"1081":-0.15289584902107772,"1082":0.10052027185652043,"1083":-0.007070523886413776,"1084":-0.08775032534102319,"1085":-0.03279564208190651,"1086":0.04196691915264435,"1087":0.11086203710141732,"1088":-0.0067607770465186665,"1089":-0.11358408343135129,"1090":0.02478069074299284,"1091":0.01655426515038775,"1092":-0.0015178070425416756,"1093":0.1148905446658613,"1094":-0.07597953929291539,"1095":0.11178832664650236,"1096":-0.2030315839008132,"1097":-0.047315778630279984,"1098":0.10459953227495786,"1099":-0.057056284825022854,"1100":0.13916297424025348,"1101":-0.18046895888418157,"1102":0.11926947644390727,"1103":-0.171869741851586,"1104":-0.17011540281464024,"1105":-0.12444289888426857,"1106":-0.1687775227072586,"1107":-0.0836103723257335,"1108":0.03175440671632774,"1109":0.03914012974000177,"1110":0.24928148878719178,"1111":-0.15824661532432452,"1112":0.13654131761321206,"1113":-0.07619421748488583,"1114":0.07632805307497195,"1115":0.12542500317065355,"1116":0.17447106491710407,"1117":0.14336118404846712,"1118":-0.16732919064718121,"1119":-0.07440136091366664,"1120":-0.038850264422228754,"1121":-0.13365525047915552,"1122":0.0015887925886302493,"1123":0.14727720201899053,"1124":-0.07320615750762964,"1125":0.07443618587633087,"1126":0.10949124912191437,"1127":-0.023136644220907603,"1128":-0.1248522958360504,"1129":-0.0774311140347417,"1130":0.11520003790908576,"1131":-0.03426829323364893,"1132":-0.20911719872603532,"1133":0.0509970256653782,"1134":0.011012775757680246,"1135":0.13997434430608863,"1136":0.16789628734043904,"1137":0.07461614582827264,"1138":0.07313993802995672,"1139":-0.042919759486485694,"1140":-0.07004749943704178,"1141":-0.020166860465760016,"1142":0.13150386909375872,"1143":-0.07526753152871038,"1144":0.04146734655761019,"1145":0.019818703704214305,"1146":0.04865612661297258,"1147":0.017027802212469197,"1148":-0.14557432064645948,"1149":-0.23653086038685373,"1150":-0.03652889820053354,"1151":-0.05234446059600527,"1152":0.0720667265410369,"1153":-0.034004751927925216,"1154":-0.10378829051438904,"1155":0.15238140170419912,"1156":0.13730486136646441,"1157":-0.17279447568068368,"1158":0.07680173040223467,"1159":0.10202491762315798,"1160":0.17969209107663156,"1161":0.15661492590031142,"1162":-0.027143301577059326,"1163":0.05131280995663769,"1164":-0.124257607704092,"1165":0.029876603460781106,"1166":-0.1241325234097581,"1167":0.04802073029781285,"1168":0.11418072961198135,"1169":0.0015202999407345139,"1170":0.06485654945755062,"1171":-0.017417699285688797,"1172":-0.12377374433494702,"1173":-0.09626740607066071,"1174":0.008094695380403005,"1175":0.186630268653448}},"8":{"bias":-0.055701138545153864,"weights":{"0":0.007458212767476874,"1":-0.052258043598520584,"2":-0.02386823420051622,"3":0.12285839050556496,"4":0.09891847591211123,"5":0.04197000778719179,"6":0.05554798693378605,"7":0.1580133855879491,"8":0.0912557298421506,"9":0.07698856767674557,"10":0.0037464187266825436,"11":-0.025087312657593903,"12":-0.025609362264348755,"13":0.06343237171056659,"14":0.1670904207547408,"15":0.07428286051166266,"16":-0.23365554106456168,"17":-0.10048295092690533,"18":-0.046486977588493225,"19":0.04381243380118211,"20":0.14241526557217954,"21":-0.15350950300826424,"22":0.07247573603942122,"23":0.1348983058579235,"24":0.05078661971437023,"25":0.014210191016602302,"26":-0.026220522943389734,"27":-0.21123751692166995,"28":0.02925890539157164,"29":-0.09665110411589459,"30":-0.12984324387309026,"31":0.173878901216919,"32":-0.10677719428325483,"33":0.08932135481652963,"34":0.09366956853333715,"35":-0.14358851785253313,"36":-0.10330696036965456,"37":-0.08734621247228859,"38":-0.03935627361371004,"39":-0.2641667694643359,"40":-0.22166790483849907,"41":-0.20524936742508199,"42":-0.18074389475423985,"43":0.11431393466672651,"44":0.11201528977279125,"45":-0.16962090493428061,"46":0.050372670407115135,"47":-0.2289601369680665,"48":0.09393356734960061,"49":-0.14129247134177106,"50":-0.015653705746498874,"51":0.13257652144636345,"52":-0.058501590368276644,"53":-0.023834172792542168,"54":-0.15087185478478837,"55":0.133989639698237,"56":0.22452040154628694,"57":-0.13961387554711166,"58":-0.050987450154889674,"59":-0.007153736753747897,"60":-0.05952320596256131,"61":0.08764186185777492,"62":0.32582829358444315,"63":-0.019186491143461635,"64":-0.1243564675644696,"65":-0.11135124305476723,"66":-0.0673689533185051,"67":-0.19408597246189743,"68":-0.06384384049091063,"69":-0.05010795324154118,"70":0.11046893131939528,"71":0.043728817474786005,"72":0.04371828460889608,"73":0.14700738938160884,"74":0.20438447494554765,"75":0.15468965356628417,"76":0.16697211184336455,"77":-0.0033566228916583644,"78":0.04386238863084616,"79":0.0749700386154052,"80":-0.1007376802713025,"81":-0.08932936522426613,"82":-0.1709112583152337,"83":0.09276526362110671,"84":-0.032609301851333226,"85":-0.1848973074111969,"86":0.12506184854420757,"87":-0.08968793552628034,"88":-0.04646704408894372,"89":-0.09590714231801674,"90":-0.1641571129170285,"91":0.0077309621403302605,"92":-0.20889653724894444,"93":0.03469996238356953,"94":0.046815912309430156,"95":0.21194508592405537,"96":0.04597939844419906,"97":-0.14121608460337445,"98":0.09361915478531584,"99":-0.03797157891827167,"100":0.08475934055001298,"101":0.08897777586289718,"102":-0.011016339221795199,"103":-0.11847415389935391,"104":-0.06416196731465815,"105":0.12577376968659854,"106":-0.1854803178258428,"107":-0.11358894493861431,"108":0.1481058020824759,"109":0.0366710170605906,"110":0.1722168172386998,"111":-0.04368364491524167,"112":-0.022223751587894698,"113":0.20279479538010478,"114":0.20009909654853378,"115":0.12406232916439551,"116":0.014129576820643757,"117":0.10737427255244988,"118":-0.09486855436234229,"119":0.01313340367587189,"120":0.02439113150040145,"121":-0.1266022989170596,"122":-0.12161459174829709,"123":0.1364414684814312,"124":0.09282564194081823,"125":-0.04746181579312633,"126":0.22962214528853772,"127":-0.061474104923465375,"128":-0.19439062743397142,"129":-0.038340339350082936,"130":-0.16091284177380535,"131":0.16154953676856226,"132":-0.07314626011019595,"133":-0.12612407253335026,"134":0.1028610078148607,"135":-0.14853903312932254,"136":0.23830785996865406,"137":-0.015013888422583815,"138":0.07116231059766483,"139":0.03672879440771438,"140":0.09058103889025036,"141":-0.041145416645824516,"142":0.06448689281487857,"143":-0.1360517486047308,"144":0.06782192022070081,"145":0.15321005126374407,"146":-0.02590467580351827,"147":-0.19096903056527664,"148":0.08176154692581039,"149":-0.12918472542594805,"150":-0.00610129936479532,"151":-0.09885059358810354,"152":0.045167586944822403,"153":-0.05312650088055156,"154":-0.1418318997824873,"155":-0.2162824935549268,"156":-0.005343945322230637,"157":0.16434912215993064,"158":-0.22672281610982883,"159":0.024950326786497872,"160":-0.04653507066558591,"161":-0.04097402635160194,"162":0.06089964898562403,"163":0.1946889606897123,"164":0.029790038987856732,"165":0.07992157321506684,"166":0.12447296140539872,"167":0.1836599500528514,"168":0.2639185116413598,"169":0.1355186998243707,"170":0.13240787704330415,"171":0.09521061403232778,"172":-0.15241001091614712,"173":0.043698317034720616,"174":-0.2067183212911132,"175":0.18083219100548162,"176":0.2647313028219255,"177":-0.01070617663222816,"178":0.1190443716652532,"179":0.03951719228005108,"180":-0.021981364750373506,"181":0.02818836577311951,"182":0.06757962871904634,"183":-0.19023904638253322,"184":-0.17503947653710802,"185":0.08926402152236618,"186":0.030769850782168266,"187":0.22593787514250244,"188":-0.21454501074355117,"189":-0.040919556751552934,"190":-0.17205166999471286,"191":0.13248171792491295,"192":-0.1806731869802838,"193":0.05757603448342942,"194":0.30441186147620786,"195":-0.12006997536060673,"196":-0.1635143742810634,"197":-0.14342356004801907,"198":-0.26323854276058767,"199":-0.2209541224169522,"200":0.302886822637538,"201":-0.11305369735596467,"202":-0.0806799389073182,"203":-0.11960617835466336,"204":0.006054904408963514,"205":0.3316342387226098,"206":0.11272398618964431,"207":-0.13686604631280322,"208":-0.15088787193331726,"209":0.07277324738810514,"210":-0.2455041428937184,"211":0.009204795608752103,"212":-0.02521265739607192,"213":-0.16829626343504192,"214":-0.0817918669858516,"215":0.09444944477184512,"216":0.07556388565600558,"217":0.10441578770508952,"218":0.0938694642248438,"219":-0.04632436130332995,"220":-0.18875228658529805,"221":0.023679652001569008,"222":-0.2243179488821794,"223":0.07464686819693885,"224":0.044693171595353534,"225":0.20830070439252554,"226":0.021233640435595565,"227":-0.0809446688318519,"228":-0.12569709915055283,"229":0.0495745882673877,"230":0.16676629260694423,"231":-0.037984799996769444,"232":-0.1112270600794173,"233":-0.014058229513744419,"234":-0.02436735882553034,"235":-0.060569092384458185,"236":0.1247545224299884,"237":-0.03117366730089115,"238":-0.15978907165908066,"239":-0.23719321512344563,"240":-0.12421483567293033,"241":0.10836156129382261,"242":0.18637758886056,"243":0.023131846322239583,"244":-0.13581849878542232,"245":-0.12023653168752042,"246":-0.035042042380874404,"247":-0.050872500389200014,"248":-0.14515725785545494,"249":-0.09244326584055743,"250":0.1044574867327138,"251":0.0002999532116009189,"252":-0.28091263451328974,"253":-0.2141677883067083,"254":0.015768645414111087,"255":0.08727195251954918,"256":-0.052544542749595365,"257":0.011202570564025028,"258":0.11278634697368604,"259":-0.04731724202602576,"260":-0.08741539373778917,"261":0.042525385285682005,"262":0.06888031671301112,"263":0.09255819384813503,"264":-0.2299626001850934,"265":-0.243575626825704,"266":-0.12736971951606535,"267":-0.14078856434919448,"268":-0.1249537311431888,"269":0.1413994838843984,"270":0.1525574192202937,"271":0.02010697740253829,"272":0.0895948047962997,"273":-0.10473642737917477,"274":-0.07431869344327527,"275":0.0506206027137243,"276":-0.17799655311690932,"277":-0.22432885869110764,"278":-0.14567660480722283,"279":-0.0807179663302367,"280":-0.06061848126366681,"281":-0.15626654979369167,"282":-0.22342769601087212,"283":-0.18852692489713266,"284":-0.17230013836186406,"285":0.13582147570562142,"286":-0.021289667247192195,"287":-0.238404296142454,"288":0.11438462562131792,"289":-0.11677261466368787,"290":-0.10460491070745093,"291":0.13611657581809683,"292":0.0466111949784747,"293":0.015610896254711813,"294":0.04636357702525879,"295":0.0797221318554159,"296":-0.009792310385061787,"297":-0.12093395771620366,"298":0.13849318240483155,"299":-0.2314520157271788,"300":0.1540851723208886,"301":-0.10825864432919294,"302":-0.18271786680322094,"303":0.12574998570506538,"304":0.2871189811951866,"305":-0.18861400014006258,"306":-0.19669473114515607,"307":0.06417840519034614,"308":-0.11780117854708873,"309":0.0040133717291113025,"310":0.24466647401927075,"311":-0.15083829260832352,"312":-0.013479233249626821,"313":-0.045916639636732974,"314":0.0825177128729241,"315":0.1101912672732732,"316":0.07608031715996863,"317":-0.1337756184061915,"318":0.0020400342326621535,"319":0.09819453398178579,"320":-0.0968280320080324,"321":-0.2370390448780854,"322":-0.006133042514269943,"323":-0.05729648888689853,"324":-0.10982362999657087,"325":0.08364131894814827,"326":0.04922364682113696,"327":-0.05790706085526628,"328":-0.045932505650877406,"329":0.07069087706458027,"330":0.14799668342873312,"331":0.13515081711531182,"332":0.04643162635899439,"333":0.11475667098955734,"334":-0.14426994774640775,"335":0.1881337525139631,"336":-0.011129411874531996,"337":0.23398172949596518,"338":-0.01612961921352762,"339":-0.24992375790986882,"340":-0.0770363988584751,"341":0.0355694778920588,"342":0.080989056596968,"343":0.2517717262321954,"344":0.1819285988409622,"345":-0.21300502846496505,"346":-0.10670125153958826,"347":-0.10966472931236866,"348":-0.029079556092061417,"349":0.3373234492425016,"350":0.1379302669713845,"351":-0.20858999205409584,"352":-0.19121004503641623,"353":-0.19156958624957346,"354":-0.06797080107308107,"355":0.08459067917993333,"356":-0.07610382912998243,"357":-0.2212661970674693,"358":-0.04343077357147243,"359":0.058376061573752955,"360":0.032601277358265436,"361":0.06861422518644682,"362":0.17791929767226355,"363":-0.21174499244241077,"364":-0.22342701187857097,"365":-0.2209016095773051,"366":-0.11322434245025816,"367":0.18214766845740382,"368":0.06250160823473298,"369":-0.10067728460579911,"370":-0.13795422915320774,"371":0.08673066945766911,"372":0.02246258962315182,"373":0.04358754012489615,"374":-0.1658477638238788,"375":-0.16076617430779727,"376":-0.13514445620195512,"377":-0.1594194185499929,"378":-0.021590908646747682,"379":-0.025323757683539838,"380":-0.12169147579166315,"381":-0.13669536120300008,"382":-0.033737051906686105,"383":0.019002621484096455,"384":-0.02574974190961398,"385":0.18956858343768665,"386":0.2816304398663602,"387":-0.015494838989183394,"388":-0.14793312442524753,"389":-0.0014525440550080524,"390":-0.20019907265220385,"391":0.10086232732812954,"392":0.2409294751667332,"393":-0.013402031050138643,"394":0.11871148029460502,"395":-0.17422338426877546,"396":0.06488869529632996,"397":-0.0996680562035647,"398":-0.002066887165536888,"399":0.07279470942508315,"400":0.12624621269309702,"401":0.20725495686931628,"402":-0.04828733916465055,"403":0.06444220854814958,"404":-0.08463877285836831,"405":0.14514291015648137,"406":0.12380332470208844,"407":-0.18425496375947126,"408":-0.3028003320287715,"409":0.1638042875874233,"410":0.21714485022576993,"411":0.03654790156875758,"412":0.010545796806801032,"413":0.09367777599827896,"414":0.12919707400559888,"415":-0.21338217145574165,"416":-0.16086357363321505,"417":-0.0671794083199249,"418":0.29868775050804336,"419":-0.00041630107907168155,"420":-0.22598203343347287,"421":-0.029281990444453593,"422":0.0052197050044481465,"423":-0.12193990944101778,"424":-0.024721778588163178,"425":0.0753919649174213,"426":-0.03173379175783988,"427":-0.20534379041280632,"428":-0.10963715473910551,"429":0.0650089043240809,"430":0.07632041328371052,"431":0.026922835614509272,"432":-0.09170087905459368,"433":0.11180727116252384,"434":0.10439164918641597,"435":-0.1213770925254241,"436":0.06711263502816937,"437":0.13349487466516136,"438":-0.15778606569395034,"439":-0.23390132472722933,"440":-0.15282342127576612,"441":-0.1482880695242008,"442":0.1464480381793538,"443":0.09693650690595587,"444":-0.24942391698239172,"445":0.023397044948402283,"446":0.02892229473186255,"447":-0.23279899067892054,"448":0.01731489387618885,"449":0.10922598667603065,"450":0.15364561010216124,"451":0.06239701119541512,"452":-0.17133164648277655,"453":-0.08618267766510893,"454":0.04871594038487974,"455":-0.21043865273789467,"456":0.14403174853191578,"457":0.12722541754439837,"458":-0.18204418259207772,"459":0.026467942281541597,"460":-0.051479378140476505,"461":-0.2781791358629792,"462":0.16782968172588586,"463":0.0719072935001226,"464":0.035328297965769764,"465":-0.10382625796744385,"466":0.3479371473698641,"467":-0.05082261140806939,"468":-0.07634580222693599,"469":-0.14063126767471554,"470":-0.11560603330414294,"471":-0.0031604307525797425,"472":0.022209072356694178,"473":-0.10408735203073288,"474":0.018917183532270853,"475":-0.023898894677276235,"476":-0.14983779941800038,"477":-0.07531236297887682,"478":0.1915150885761249,"479":0.04004038472813156,"480":0.08048279684653808,"481":-0.029230142699246123,"482":0.021398756740158818,"483":-0.10161094863891336,"484":0.22156727110553343,"485":0.10853711724313814,"486":-0.04524708574175626,"487":0.17983032497043555,"488":-0.015579753588529466,"489":-0.016010163647005218,"490":0.0030868712337201653,"491":-0.09521565773615695,"492":0.13115076031762746,"493":-0.2053578560769421,"494":-0.11957490425753517,"495":-0.06466768389952321,"496":-0.11420653015179197,"497":-0.02988545428252354,"498":-0.03091334163942647,"499":0.03242882723171107,"500":0.11361072917442906,"501":-0.16749327760267604,"502":-0.07903626653830594,"503":-0.06427894910274377,"504":0.09451231943346618,"505":0.33776044952984335,"506":0.105697730311512,"507":0.11594287403460903,"508":-0.224427112426235,"509":0.03140675391258431,"510":0.03197033180935355,"511":0.09099772021873126,"512":-0.03250223378836596,"513":0.02988056590592173,"514":-0.05839098958494138,"515":-0.22862271340029688,"516":0.2641983323944834,"517":0.004307061087786683,"518":-0.05105682791187758,"519":0.0602547970123682,"520":-0.09729478142633095,"521":-0.05559943633474878,"522":0.131988328022435,"523":0.14560413129193156,"524":0.10706458552799651,"525":0.08213424708208228,"526":-0.1124647974321189,"527":0.17207945382997097,"528":0.24538722114355305,"529":-0.021105982093099336,"530":0.037817284052555016,"531":-0.02297052753606178,"532":0.16574861256045323,"533":0.14088399911622285,"534":-0.11294853282938752,"535":0.15091988379847762,"536":-0.045820878722465264,"537":-0.11636624490428636,"538":0.15065710343587885,"539":-0.0010952468908053423,"540":-0.07823510490553086,"541":-0.13523686758606848,"542":0.15506947264994536,"543":-0.1846703537416708,"544":0.14324453056234,"545":-0.10811030170781624,"546":0.07887178906855931,"547":-0.06963900569500833,"548":0.09122549397866661,"549":-0.04062343783528941,"550":-0.16565097388720015,"551":0.10906727803080282,"552":0.15772174349011014,"553":0.022678165778166264,"554":-0.08854091541527233,"555":-0.03986697224686047,"556":-0.09778561614506673,"557":0.23677742920792114,"558":-0.14181281264382375,"559":-0.059985757125678246,"560":-0.033112168333252645,"561":-0.08558235349903043,"562":-0.09328467080431575,"563":0.06556255219100061,"564":-0.12122849252379363,"565":0.17738572770512426,"566":-0.14670002905563675,"567":-0.04964809994069228,"568":-0.10319533921617767,"569":0.01768294708873027,"570":-0.05726630200253548,"571":0.08474086990708728,"572":0.005241448401997972,"573":-0.20371765239244938,"574":0.05846211101178546,"575":0.1316825133909027,"576":0.0940418581905122,"577":-0.06741055737366713,"578":0.03908162720456473,"579":-0.08055009475987754,"580":-0.11303989182728462,"581":-0.1834593197273349,"582":-0.06539241913609073,"583":0.014988840366427367,"584":-0.12246452003386414,"585":-0.15649715147006307,"586":0.13518429484997666,"587":-0.210828593650603,"588":-0.18772201566088972,"589":0.05687254430921192,"590":-0.10743997398862383,"591":0.061300143515073895,"592":-0.05901575292930552,"593":0.029296555111913775,"594":-0.16192255428629151,"595":-0.13018607654964118,"596":-0.09052052911785402,"597":0.12424265055806409,"598":-0.07780894850969937,"599":-0.18931094234656393,"600":-0.039039091307417416,"601":0.09734230655853447,"602":-0.053772275717748466,"603":0.07934568946915686,"604":0.012679641495186262,"605":-0.2007020665495788,"606":-0.11732975707453669,"607":-0.006404819609135081,"608":0.10858916939020218,"609":0.10394739003779187,"610":0.16318846264672585,"611":0.020131071586905813,"612":0.04544872573769846,"613":0.006738425970480386,"614":0.16043175042228722,"615":-0.09156060045686326,"616":0.0544021966883011,"617":0.06601929668013777,"618":-0.08411841192535528,"619":-0.037794526301549905,"620":-0.1748634820435242,"621":-0.041697808648069705,"622":-0.09904284447352271,"623":-0.0694811994526512,"624":0.019362299659337775,"625":-0.1439157940492988,"626":0.1436654907517928,"627":-0.030269939270863147,"628":-0.11044827335084045,"629":-0.07726870573415594,"630":0.17225365069631443,"631":-0.20809968551648514,"632":-0.10731170888633013,"633":0.13005880629988656,"634":0.08576681246468949,"635":0.13696624261057844,"636":-0.0581896472712716,"637":-0.12267612032579897,"638":-0.177480169109493,"639":-0.2758587911805528,"640":-0.23986042596955578,"641":0.01694099919808429,"642":-0.002862495224985172,"643":-0.08527792614973946,"644":0.08542813651831128,"645":-0.08676867719197057,"646":0.0021956061013030615,"647":-0.11599090874401229,"648":0.16250497359222996,"649":-0.2119314756438357,"650":-0.1155636499096975,"651":0.09804176226491539,"652":-0.14697765859142797,"653":0.130913621476191,"654":-0.13411847152146542,"655":0.06944944029911547,"656":-0.13236366614157893,"657":0.06093645066409536,"658":-0.13685368609179888,"659":-0.020713662806522665,"660":-0.13730700416681157,"661":-0.006244758191557657,"662":0.01474783236655082,"663":-0.2300709184485859,"664":-0.09901135300437534,"665":0.11653372089303246,"666":-0.1432479591711952,"667":-0.09373088291791272,"668":-0.21939903183117157,"669":0.02232805986893925,"670":-0.1957389018294831,"671":0.14646400815875302,"672":0.24872361494667639,"673":0.002752022788874702,"674":-0.16906728229731469,"675":-0.1340986363265815,"676":0.051344076809043175,"677":0.13013949332730812,"678":-0.08054855308602583,"679":0.06454451797110146,"680":0.09433394944609882,"681":0.13205726369733264,"682":0.044939511892950375,"683":-0.10386721520709202,"684":0.1142086151656118,"685":0.08047800571234219,"686":-0.02383401618831282,"687":-0.17638700222910972,"688":0.0910454828369632,"689":-0.008036562284038599,"690":-0.05986191497165519,"691":-0.04164328149541067,"692":0.038504514353497526,"693":0.1254903356935536,"694":-0.08845928235642105,"695":-0.11935245527230894,"696":0.09144086145915568,"697":-0.033317538430371586,"698":0.15365141629661316,"699":-0.22041109430452452,"700":-0.06324482762756843,"701":0.20935124950402942,"702":-0.18749218342482843,"703":-0.18785286258146017,"704":-0.23714959393950258,"705":0.07273538215843166,"706":0.05154618310318206,"707":0.14783915216173094,"708":-0.03836250585678619,"709":-0.05172501241663398,"710":0.010754343544621021,"711":0.01829270544238267,"712":0.16708953666424106,"713":-0.04132655950483029,"714":-0.13584447999551744,"715":-0.11305158822207297,"716":0.09407266395079598,"717":-0.07308099129632828,"718":-0.12042370977866734,"719":-0.029240217123747646,"720":-0.00792080408151518,"721":0.20825134732129982,"722":0.06782980541824166,"723":-0.0839648788322239,"724":-0.1571327393520595,"725":0.21718105115739492,"726":0.010549327261476624,"727":-0.1453197206390359,"728":-0.05399669221232784,"729":-0.14632861937773448,"730":-0.09645132435003953,"731":-0.13035506350893672,"732":-0.1658047429913678,"733":-0.15828262326837933,"734":0.1657431710861799,"735":0.13550442080434097,"736":-0.02115549922612084,"737":0.25789631295022947,"738":-0.1746587858449362,"739":0.11247161963186268,"740":0.09687716509511642,"741":-0.23896681962128424,"742":0.019386268340406118,"743":-0.1073038902871652,"744":0.06696478045492407,"745":0.03223005864486214,"746":0.1741695617722229,"747":-0.2036007500704186,"748":-0.0719059280526798,"749":-0.136693161874261,"750":0.18815018606283318,"751":-0.13047590649974034,"752":0.0717218363876296,"753":0.1153780612645024,"754":-0.012806547991081012,"755":-0.0653764349377805,"756":0.03779141541329675,"757":0.17589652000631184,"758":0.0899481580725238,"759":-0.0111300140523711,"760":0.02769922907677843,"761":-0.13114981380970683,"762":0.03949159746143283,"763":-0.025281088502008536,"764":0.12992241694090725,"765":-0.1796795138184922,"766":-0.15634449371723994,"767":0.0853289518189648,"768":0.002496072967187014,"769":-0.19803146366683366,"770":0.019353624788197785,"771":0.05108675252558738,"772":-0.2129763492558812,"773":0.09942690326215385,"774":0.1792329724751856,"775":0.062461191957022905,"776":-0.11614959941154894,"777":0.09938560658239987,"778":-0.13442628185024766,"779":0.10750982072033573,"780":-0.11989875571864925,"781":0.1350020215230835,"782":-0.19185215673900705,"783":-0.1474322940469959,"784":-0.13832651536327498,"785":-0.07844669547658127,"786":0.1302436124609786,"787":0.04115711578009233,"788":-0.1351968744435456,"789":0.05356005339568695,"790":0.14009826476512086,"791":-0.05137205692913602,"792":-0.05077097152561406,"793":-0.22981800921393075,"794":-0.04362674614633191,"795":-0.269935442632743,"796":0.11490765007033911,"797":-0.1519193331511182,"798":-0.11351250992280755,"799":-0.10398475505942552,"800":-0.06609275800225554,"801":-0.13867452513029424,"802":-0.017362396839140152,"803":-0.18071916019529755,"804":-0.03836186098490149,"805":0.2161504535704045,"806":-0.19554762120925767,"807":-0.07363651825314184,"808":-0.10364153979042412,"809":-0.030501696742072683,"810":-0.08420748789902774,"811":0.16962191412516706,"812":0.1964251934312219,"813":0.07899516055228543,"814":0.04538267624219669,"815":-0.09940334783005002,"816":0.07055909735136157,"817":0.060626461909050966,"818":0.0012378306040420966,"819":-0.17254421733394054,"820":-0.07893052146607453,"821":-0.19036759573347256,"822":0.032096844073274206,"823":-0.13969091684692056,"824":-0.13173189061280444,"825":0.0837818153659874,"826":-0.0381066043263544,"827":-0.07612304712966467,"828":0.16667750765367367,"829":-0.15241405201463545,"830":0.08634833553101735,"831":0.02822205460501452,"832":-0.05253299494285685,"833":0.0987333271517424,"834":0.0636267634401977,"835":0.07717946672283407,"836":0.12608265412545974,"837":0.14049387234886743,"838":-0.09671124557889534,"839":-0.12041428084896377,"840":0.09844120022314425,"841":-0.1807989145287977,"842":-0.06852607835162582,"843":-0.22538389769452158,"844":0.031212719681980302,"845":0.18484613479663078,"846":-0.04846886144760308,"847":0.0216949614106175,"848":-0.14276835603560542,"849":-0.04323517064001785,"850":0.14957268127032433,"851":0.12968752809878908,"852":0.02947495669648008,"853":-0.049891497512615554,"854":0.07541294076312825,"855":-0.24645510634541162,"856":0.16711738847865884,"857":0.20662718969295238,"858":-0.05584905579711815,"859":-0.006967837396491701,"860":-0.07743269964330723,"861":-0.14128169603956886,"862":-0.06732769428315934,"863":0.19925352353076223,"864":0.10797032613261419,"865":-0.208159790151085,"866":0.13871865230905134,"867":0.0633084129651167,"868":0.2227591269414806,"869":0.014603969572053272,"870":-0.09754718370278137,"871":0.05945701016099308,"872":-0.17787394260134892,"873":-0.0788579765761274,"874":-0.2509384370434171,"875":0.009393511762198188,"876":0.21984770909027998,"877":0.13655694098931537,"878":-0.179004851423608,"879":0.1144115493416607,"880":0.2233954740930173,"881":0.02954153764718192,"882":0.13638279763507485,"883":-0.009700931068956435,"884":0.05120488231802712,"885":-0.1925608831044202,"886":0.12639787169134067,"887":0.05623555973294385,"888":-0.21209068696823946,"889":0.1167768802272177,"890":-0.07006590336384175,"891":-0.2223415393191433,"892":0.013439251735939912,"893":-0.011985511780613935,"894":0.07708867491212967,"895":-0.07349299471691786,"896":-0.06655695378623233,"897":-0.2879989301458237,"898":-0.1694203877683237,"899":-0.042451127013572516,"900":0.11078497065808923,"901":0.20338208940954886,"902":0.14945205389666472,"903":-0.04729597761685359,"904":-0.06393629973079984,"905":0.12069905166361643,"906":-0.16252571439945526,"907":0.12633870115455959,"908":0.16411045174890146,"909":0.12432871141959244,"910":-0.09321042771188681,"911":0.017329937660213766,"912":-0.18312836757791653,"913":-0.14171303341369343,"914":0.07149800722758018,"915":0.09353527901608497,"916":-0.03415376475430524,"917":-0.0023296381721620305,"918":-0.15497553249027843,"919":0.16743283737033046,"920":-0.1378255993515196,"921":-0.1390598702262743,"922":-0.12243031877862093,"923":-0.052540683794292393,"924":-0.14253017208462868,"925":-0.13270642212483974,"926":-0.07205072344093882,"927":0.12575599701414564,"928":-0.022292503625919998,"929":0.1463365066124994,"930":-0.03615376725910258,"931":0.08150688948999213,"932":-0.0791237367324068,"933":0.08868639863211754,"934":0.010371907183451547,"935":-0.11425064883107945,"936":-0.015202106105754828,"937":-0.1427097945811873,"938":-0.02605015730488307,"939":-0.09112108311889199,"940":0.009274731905375271,"941":-0.045959247556973754,"942":0.08537097963503192,"943":-0.060702871757474255,"944":-0.07228570234784525,"945":-0.12432150543381519,"946":-0.13851147665444732,"947":-0.2111162437201545,"948":0.05412575214188307,"949":0.06599604569742269,"950":-0.05242599672505399,"951":-0.05075372349536073,"952":0.15241154689656825,"953":0.0703997150181188,"954":0.2993835155487455,"955":-0.13286438814490367,"956":-0.014871663702779368,"957":0.09682788906614856,"958":-0.031685165428055356,"959":0.14498545393719312,"960":0.14551758993214176,"961":-0.055646510219913556,"962":-0.02970826221604416,"963":-0.1112723228384804,"964":-0.015811618845787027,"965":-0.10873048228817778,"966":-0.15990638675265412,"967":-0.052700341827555404,"968":-0.06812235281999285,"969":-0.08847016960068635,"970":-0.1497824942805995,"971":0.11563745871897199,"972":0.07363897771111377,"973":0.13613617988356203,"974":-0.06355731917810256,"975":-0.1171376861422059,"976":-0.07123050159736774,"977":0.13562816296807734,"978":-0.06455810476050841,"979":-0.0807165729680542,"980":-0.05144183114079307,"981":0.13535856881705974,"982":-0.023985342836474265,"983":0.17430897332596457,"984":-0.03474361017136858,"985":0.1868502186697713,"986":0.04639010701076049,"987":-0.20801165498834776,"988":-0.17821968964857143,"989":-0.034325963681222385,"990":0.02447910499755653,"991":0.006600265247033927,"992":0.16063360875678867,"993":-0.010890913566910817,"994":-0.15767714184974005,"995":-0.08964727133253488,"996":-0.11424369046260244,"997":-0.10416245998600382,"998":0.031144044070951026,"999":0.12625525351749523,"1000":-0.09316129879469165,"1001":0.09417123165059875,"1002":0.09956682871670847,"1003":-0.04307316001694143,"1004":0.10741352089345699,"1005":0.09558149967495645,"1006":-0.14659902052090626,"1007":0.17964483659317315,"1008":0.24593257604335328,"1009":0.15280533865280818,"1010":0.010482918546922489,"1011":-0.22248008889086124,"1012":0.13822513731466704,"1013":-0.13441260031387045,"1014":-0.2149650654562946,"1015":0.06494441012978891,"1016":-0.08882620641756693,"1017":0.10580670738506144,"1018":-0.11876268423407284,"1019":0.138707660681332,"1020":0.23985231444002666,"1021":0.10597809331734032,"1022":-0.025521443876811586,"1023":0.08299596826979387,"1024":0.029937052683898256,"1025":-0.20964552257798058,"1026":0.05124776237463074,"1027":0.12854619568199613,"1028":0.0007599423042424126,"1029":-0.17978702496603785,"1030":0.03056178196723699,"1031":-0.052335166123275996,"1032":-0.024166260357528953,"1033":0.13441638775923856,"1034":0.034895818849437474,"1035":-0.2003722352559818,"1036":-0.07125035019698649,"1037":-0.12435496519042234,"1038":0.08473207966974397,"1039":0.015672476278872773,"1040":-0.08005635582991259,"1041":-0.03786504259706449,"1042":0.04059722569378706,"1043":-0.134418300048693,"1044":-0.10644693725245241,"1045":0.1608728810653783,"1046":0.13496973132774148,"1047":-0.15681168382848107,"1048":-0.05097030472773085,"1049":-0.10286350884711512,"1050":0.128205336117232,"1051":0.005492884266185972,"1052":-0.11339107934628731,"1053":-0.17099099881968563,"1054":-0.02073237042138893,"1055":0.17240999547144717,"1056":0.052827381922447736,"1057":-0.08930657539720532,"1058":-0.050903560080269306,"1059":0.029485632141478837,"1060":0.009345960324682046,"1061":0.15085469906481355,"1062":-0.036147415616903704,"1063":-0.12868890091155377,"1064":0.10405002065887486,"1065":-0.1721818653800618,"1066":0.0392209881409046,"1067":-0.22821320678003668,"1068":-0.12773531253607837,"1069":-0.07231569647560156,"1070":0.07343155023558054,"1071":0.03906301674353477,"1072":0.018525961653075452,"1073":-0.026968659922153033,"1074":-0.22592191063717112,"1075":-0.06155754294342247,"1076":-0.08384324886603363,"1077":0.13280988036702301,"1078":-0.14556793244869837,"1079":0.15499745576292834,"1080":-0.21110948055974307,"1081":-0.20428260295036246,"1082":0.02423033883950087,"1083":-0.19383685254433353,"1084":-0.21004639731279526,"1085":0.1711780115090074,"1086":0.13034124643598738,"1087":-0.13965171976203117,"1088":0.05223575487978377,"1089":0.14793106406392587,"1090":-0.1635436188731571,"1091":0.03028281576408739,"1092":0.0643865976377916,"1093":0.02664126932489505,"1094":-0.09667828278862378,"1095":-0.044942750390307776,"1096":-0.005972136098621401,"1097":0.05890669828335815,"1098":-0.0013310268275580168,"1099":0.014344205825813184,"1100":-0.07883432532935337,"1101":0.1237344389673747,"1102":-0.09859973116072253,"1103":-0.10701927820685234,"1104":-0.06120877342438612,"1105":-0.06666348570486469,"1106":-0.13679638561475893,"1107":-0.1786479034195516,"1108":-0.19529348556275083,"1109":0.1074189203684452,"1110":0.06080198232529845,"1111":-0.05090793134250104,"1112":0.04903738172719018,"1113":-0.1903272663402339,"1114":-0.18639141889302815,"1115":-0.16897988591281848,"1116":0.02089728877496138,"1117":-0.20405743706512144,"1118":0.016918708657816948,"1119":-0.1301826166877968,"1120":0.17563514470278765,"1121":0.19556335964462923,"1122":0.37941104598134867,"1123":0.10990694457231505,"1124":0.20434972592457415,"1125":-0.2046750007805179,"1126":0.05098588531959197,"1127":0.010320243521938386,"1128":0.028490635322331218,"1129":0.013175458861793478,"1130":-0.17727624247606658,"1131":-0.056357718853650915,"1132":-0.14537927238064446,"1133":-0.12587189209077718,"1134":0.06553055639213741,"1135":0.23206100604198704,"1136":-0.18940081428076574,"1137":-0.015592631969207814,"1138":-0.02944813992596883,"1139":0.08416943080916958,"1140":0.17938264559922465,"1141":0.1866432195060835,"1142":0.12210060437609876,"1143":0.03393671954635334,"1144":-0.16369157762730469,"1145":-0.030412853896502237,"1146":0.170038353717765,"1147":0.06588665647928528,"1148":-0.1067419073898742,"1149":0.11412695977580307,"1150":-0.18137002643084768,"1151":0.052291330580731904,"1152":0.21281715215225613,"1153":-0.0717920864455098,"1154":-0.026670774859649523,"1155":-0.15530758593745453,"1156":0.12205833302551275,"1157":0.0879637882622288,"1158":0.017430956845039803,"1159":0.107027782488104,"1160":-0.1353492475926145,"1161":0.04658090221434243,"1162":0.13600423563062794,"1163":0.18029568354760478,"1164":0.1562631803007644,"1165":0.2358310993491183,"1166":0.05678799049566012,"1167":-0.27989340129091217,"1168":-0.0017261016921801843,"1169":-0.11830724437415409,"1170":0.14726871725701884,"1171":0.1362490123413369,"1172":0.008899111127049567,"1173":0.09938519891799505,"1174":0.08218922113033217,"1175":-0.00964141512994916}},"9":{"bias":-0.17413961609632533,"weights":{"0":0.14301276094661106,"1":-0.17471274546035112,"2":0.006002522488223464,"3":-0.1583117299086878,"4":0.15029803015864188,"5":0.0828894250698026,"6":-0.13291353268511663,"7":0.1585763674319397,"8":-0.02315201356562896,"9":0.07956145751952828,"10":0.05934963057348741,"11":-0.009888624695711714,"12":0.15332827797163304,"13":0.14997727330259972,"14":0.04729481802112509,"15":-0.08257182600741031,"16":0.13858813445897417,"17":-0.02004452616571472,"18":-0.22926445601531462,"19":-0.12268980197908261,"20":-0.09027763497235614,"21":0.03741147719239846,"22":-0.15010388165887398,"23":0.09220199963768866,"24":0.11646411043336052,"25":-0.10761950639294547,"26":0.06734258758239849,"27":0.11000217839514816,"28":0.09283301816313524,"29":-0.1895515322639086,"30":-0.1519822490615249,"31":-0.1876452027610694,"32":0.13265465607554158,"33":0.2069545121016217,"34":0.18143470810524462,"35":0.1487430859880222,"36":-0.017370493323194045,"37":0.08330839480563512,"38":0.1322974959650685,"39":-0.14687349670026187,"40":0.13108654876889836,"41":-0.12386481827782124,"42":-0.1304266481468718,"43":0.17762165011962594,"44":-0.09343715985563862,"45":-0.21237527778355828,"46":0.11399126535830142,"47":-0.01686965532246706,"48":-0.10865774563744268,"49":0.10105260895098206,"50":0.05248415833892166,"51":0.13355258040190485,"52":-0.20088319566769594,"53":-0.04847989546878562,"54":0.10684906128543317,"55":-0.16989443957118194,"56":0.21689896345001405,"57":-0.03261331163150629,"58":0.1616158793414946,"59":-0.08122373420702331,"60":0.04245315819910085,"61":-0.040502400797447366,"62":-0.03149037848189363,"63":-0.13652385122428984,"64":0.04110612988272303,"65":-0.02913449360529637,"66":-0.12654614216188814,"67":-0.17511300490384737,"68":-0.10462139300520965,"69":-0.01161323429916657,"70":-0.12456752671309924,"71":-0.0467309346108976,"72":0.0588379218443713,"73":-0.14324343117294958,"74":-0.034634422923175846,"75":0.10188745294005652,"76":0.06469286757343362,"77":0.0650899503656148,"78":0.16203917642091104,"79":-0.15247353867505375,"80":0.09553439160383041,"81":0.09958663074494549,"82":0.13539125152529724,"83":0.05873916037439495,"84":0.021260093396112602,"85":0.09163608486560527,"86":0.2153689786186946,"87":-0.13510099646979012,"88":0.1657477034087985,"89":-0.02566804139933247,"90":-0.13572427872378132,"91":-0.11458243757700998,"92":0.10857527394322239,"93":-0.13546882868487894,"94":0.1513212241561823,"95":0.22506856710286358,"96":0.10481498996376747,"97":0.03374078376506981,"98":0.04282950714413987,"99":-0.154213130589483,"100":-0.1596773089623023,"101":-0.023128871913300108,"102":0.01193684184601056,"103":-0.08691613521361637,"104":0.18172664402138977,"105":0.11484644525855218,"106":-0.010286880017812172,"107":0.1029969701388574,"108":-0.1528954228826346,"109":0.06458015823163622,"110":-0.1364324424878661,"111":-0.04531530173182854,"112":0.18963512871344632,"113":-0.0027045944327376125,"114":-0.06243169009133662,"115":-0.09972686089383637,"116":0.06421051908087734,"117":-0.016339665207857828,"118":0.2008754423294804,"119":0.06341102764874172,"120":0.08860197360433877,"121":0.16492699242804607,"122":0.07399981341661996,"123":-0.17341123816683876,"124":0.1676682282340024,"125":-0.014491518933979953,"126":0.1278280205785567,"127":-0.1591613481927273,"128":0.08031740953024162,"129":0.06852483741807251,"130":-0.2039468771325933,"131":0.17625112608266044,"132":0.16537897562539217,"133":-0.09896924186588837,"134":-0.1618120194696721,"135":-0.10683119041980665,"136":0.20414079406513075,"137":0.20658871944627874,"138":0.1795485149126831,"139":-0.07941484617502675,"140":0.1021243016140018,"141":0.15593372193700086,"142":-0.16027057105903944,"143":-0.11951319205494608,"144":0.15401126258939257,"145":-0.20637594410358515,"146":0.18004649150430668,"147":0.017617830002258156,"148":0.0872724090039365,"149":0.17705602479433472,"150":-0.0643104248615171,"151":-0.0025729857948347157,"152":-0.08572732356163644,"153":-0.030898516359916472,"154":0.18598093436839366,"155":-0.14661377308997664,"156":0.026563396123963544,"157":0.03538412827812069,"158":-0.051496354505056255,"159":0.10473207060499844,"160":0.10438218916921764,"161":0.15909460767832273,"162":0.026490210640050776,"163":0.20421223578594522,"164":0.1307895098937752,"165":0.09380650984591016,"166":0.1056481918250336,"167":0.1635227622762078,"168":-0.06710552339982623,"169":-0.10611736617439305,"170":-0.16116202447041345,"171":-0.10745750141071067,"172":-0.11013877095503509,"173":-0.03725196561452542,"174":-0.1850172808506842,"175":-0.13268634813268756,"176":0.18914859446239488,"177":-0.20035047436494083,"178":0.0658762419097508,"179":0.0754470546865636,"180":0.18696166108914103,"181":0.18837080317343013,"182":-0.09965733041877285,"183":0.0013364770606410555,"184":-0.17581965591603588,"185":-0.19832453483566043,"186":0.011024494562696453,"187":0.1603730034364706,"188":-0.006906134511422177,"189":-0.2215675662707981,"190":-0.07751563796039238,"191":-0.04994825771768306,"192":-0.17770034201249596,"193":0.11023824941568366,"194":0.12260015439470845,"195":-0.21916474477961254,"196":-0.1594716378437538,"197":-0.07501043960587692,"198":-0.12496415770535417,"199":-0.15820483788005385,"200":0.09224557823919359,"201":-0.10117474922382969,"202":-0.15617966112196283,"203":-0.12073293004244161,"204":-0.18368158231901507,"205":0.16396888697657552,"206":0.07752539725595414,"207":0.03815106384197143,"208":-0.12332926681047438,"209":0.1312311647746816,"210":0.03966411497568248,"211":0.19042028707623124,"212":-0.11515684616205835,"213":-0.007590197662918205,"214":-0.22659657314134563,"215":0.0754394420186297,"216":-0.10960538996663324,"217":0.03855966491402275,"218":0.19461060223454407,"219":0.17713902403429987,"220":0.04479673752356236,"221":-0.1507350407802768,"222":0.03198296631516586,"223":-0.15651975909359403,"224":0.18327108462763825,"225":-0.19032083079522105,"226":0.006345497075030378,"227":-0.13143748221405233,"228":-0.053823579584362576,"229":0.03414294806332788,"230":0.05147134282160986,"231":-0.041315918214821064,"232":-0.10966368982186668,"233":0.12840599320222407,"234":-0.2494155064653082,"235":-0.19142715431305696,"236":0.007368466666874769,"237":-0.0493037822416946,"238":0.14574075598789818,"239":-0.231148246788898,"240":-0.11753476732260223,"241":-0.18397039934129125,"242":0.051701747348534825,"243":-0.1902980820774722,"244":0.06848518015060186,"245":0.1503569970537314,"246":0.16918841408621138,"247":-0.02280293225237037,"248":-0.1677813240016169,"249":-0.1648152868022381,"250":-0.13031064846699528,"251":0.2083998030494547,"252":0.08952801659612898,"253":-0.1583822455935738,"254":-0.10640139491692888,"255":0.07586740997279591,"256":0.03521341173004127,"257":-0.12808640792845058,"258":0.09483074103685772,"259":-0.1306844311724988,"260":0.1655287193015356,"261":0.11356715108324172,"262":-0.057402564420940994,"263":-0.13397792669131492,"264":-0.06258400426077143,"265":-0.03311939356027198,"266":0.16259064621748667,"267":0.057071433141584325,"268":-0.08043941131275766,"269":0.12065688715334415,"270":0.07672007876785852,"271":0.046219200360448846,"272":-0.2315744690517432,"273":0.023901501933783577,"274":0.031107544065641635,"275":-0.08064549688444153,"276":-0.15371947787009874,"277":0.09078348845228726,"278":-0.04641831625800133,"279":0.022755214844122233,"280":0.23903087835592332,"281":0.01595821783597338,"282":-0.19002216791640994,"283":-0.017873539961344033,"284":-0.2102448266890769,"285":-0.18319027526855405,"286":0.01923449190643998,"287":-0.0295582437878782,"288":0.12215188022692,"289":-0.1669742082900407,"290":0.12866946763949094,"291":0.05782642587138747,"292":-0.1608721905306413,"293":-0.16293008357928718,"294":0.09603171898881054,"295":-0.07313833456528462,"296":0.05453630888973453,"297":0.12083457029028057,"298":0.1581260162391507,"299":0.11566060162262064,"300":0.08150525684884734,"301":-0.15794341187134125,"302":-0.013989198576547304,"303":0.06965031949017662,"304":0.1280345179683143,"305":-0.12003860725633841,"306":0.06982931243103131,"307":-0.0765614500953636,"308":-0.0938186021413729,"309":0.0942774285068168,"310":-0.11714779763476593,"311":-0.13453493978894032,"312":0.03480843665101292,"313":0.014717123475500199,"314":-0.1467952000366989,"315":0.03877339187732619,"316":-0.01968811049857176,"317":-0.19267301123286557,"318":0.06900896504027017,"319":-0.04644128790003936,"320":-0.03147140145604955,"321":0.1318773071401378,"322":0.02622750392610425,"323":-0.16362985340033437,"324":-0.22365986187007378,"325":-0.03131800443379991,"326":-0.11684106538488075,"327":0.11014799035791083,"328":0.21613244588610792,"329":-0.1479261001428483,"330":-0.07300935596507753,"331":0.20353188555300428,"332":0.07699328254683051,"333":-0.14778455411936534,"334":0.10922103204101254,"335":-0.07523312114309338,"336":-0.03703603132024392,"337":0.15316020358087223,"338":-0.11546259718356279,"339":-0.2115150029300728,"340":-0.010366789590338904,"341":-0.1593217343600909,"342":0.1191451824947031,"343":0.2653398785597215,"344":0.045157784567441864,"345":-0.21823468748257768,"346":-0.029176543670393948,"347":0.08643199036478763,"348":-0.08557666767491974,"349":0.19313090674166417,"350":0.15252767138724305,"351":0.044120419662631374,"352":0.14265462595301975,"353":0.1823490146350118,"354":-0.21286616179136805,"355":0.1029211678266912,"356":-0.06164419560544664,"357":-0.12904599700545138,"358":-0.045964738376506505,"359":-0.057235912886937856,"360":0.14057739427437202,"361":0.045269159211419926,"362":-0.11839388093537537,"363":0.10812680566708281,"364":-0.18947214647245555,"365":-0.18075482875419444,"366":-0.23298479208077819,"367":-0.05287538623314993,"368":0.021373636148827646,"369":-0.14499967633473848,"370":0.10575155834529844,"371":-0.1215588267004251,"372":0.09089284496197994,"373":0.24128775473824485,"374":-0.09990998552101492,"375":0.09226306531187604,"376":0.018840276931055503,"377":0.034115112030973435,"378":-0.131180747201284,"379":0.06624116140875771,"380":-0.17299514151183476,"381":-0.14592370342029462,"382":0.011636288658524068,"383":-0.04074263688373524,"384":-0.14436282389011532,"385":-0.14750091943070565,"386":0.011909781577144563,"387":-0.19827773996819434,"388":-0.1680911452268207,"389":-0.15475589861398756,"390":-0.12649158332721422,"391":-0.07428422794076503,"392":0.05983944755949897,"393":-0.0907555195485694,"394":-0.046074014012229485,"395":0.15113593417612536,"396":0.10443998781959787,"397":0.17293281087567466,"398":-0.06955571463748539,"399":-0.11795490073207765,"400":0.11852585551351781,"401":0.1797356068788523,"402":0.080080788260977,"403":0.1879489474295035,"404":0.07063135209818158,"405":0.04372199956550617,"406":0.18891225132708248,"407":-0.033466878126989674,"408":0.0711377004521911,"409":0.05914189419700003,"410":0.19344122756874643,"411":-0.12467731782867034,"412":0.000821803676125571,"413":-0.020459436265048096,"414":-0.08266963473344072,"415":-0.11878212254266951,"416":0.1200363086976306,"417":0.20982129072161296,"418":-0.06223761209889924,"419":0.11004794455665297,"420":-0.03219814728637663,"421":-0.18013797103593063,"422":0.14304635706888338,"423":-0.05585777301380708,"424":-0.14538133697280609,"425":0.08290174548135962,"426":0.14330923543383234,"427":0.12571023170903342,"428":-0.12691990263150263,"429":0.13531828200090504,"430":-0.18550727545386891,"431":-0.22754335399161513,"432":0.11830640759131834,"433":0.08513778462092068,"434":0.052128349169894936,"435":-0.05216497169598668,"436":0.03591407667537691,"437":0.08275846381378046,"438":0.016455219938667914,"439":0.12276940390780536,"440":-0.014020598090002298,"441":0.19040045719939888,"442":0.09352578310151367,"443":0.14074143820199297,"444":-0.03834046099684809,"445":0.1633159983465373,"446":0.0938290013025721,"447":-0.07866227822208496,"448":0.11159302730642554,"449":-0.24464417496595345,"450":0.12388945163113324,"451":0.00841663147402949,"452":-0.19862085864107012,"453":-0.184956499391837,"454":0.21189596176331404,"455":-0.13817852973762987,"456":-0.15762555725347288,"457":-0.11707332487029826,"458":0.0645943925562624,"459":0.0799433192214004,"460":0.23061833403136922,"461":0.09450457166645902,"462":-0.1209575067251501,"463":-0.1116247655855596,"464":0.06936869124026042,"465":0.06567679903171078,"466":-0.043878167633707686,"467":-0.07821113189918581,"468":0.13517813664195405,"469":-0.012659816710824737,"470":0.029176562570140722,"471":-0.03550578182069211,"472":-0.07832349753056712,"473":-0.06200427249664925,"474":0.0005237151763363993,"475":-0.20494225209115383,"476":-0.2090122725586405,"477":-0.06946296927311439,"478":-0.13613917321778204,"479":-0.15363467190723099,"480":0.16787915440604742,"481":0.1064657520307968,"482":-0.06967065165831773,"483":-0.021228574361004914,"484":0.14792792553858167,"485":-0.11615049758539542,"486":0.06262675513520154,"487":0.003659722972260594,"488":-0.05750238519275768,"489":0.10595183390876865,"490":-0.0658354363060655,"491":-0.11719210706274984,"492":0.11927048877294183,"493":0.0511045534121205,"494":0.07095230210671988,"495":-0.08036148449527271,"496":-0.06027831168231491,"497":0.17921633013640015,"498":0.06717494049144813,"499":0.16695467088667115,"500":0.05329531676798662,"501":-0.1245361141591663,"502":0.056068662952536714,"503":-0.14114034608474846,"504":-0.1308848280522318,"505":-0.00044215452127608696,"506":-0.11516529807155568,"507":-0.10797579054185609,"508":-0.09771515648758784,"509":0.14848095631316535,"510":-0.17013985060212705,"511":0.12468025167283482,"512":0.049316980498882355,"513":-0.1851669096725466,"514":-0.016403753914817968,"515":0.06846800211946388,"516":0.24709208941816763,"517":-0.021184424367662963,"518":0.1375822617819747,"519":-0.01272688795148813,"520":-0.16480313083827672,"521":0.21226207729416674,"522":-0.05783794948641987,"523":-0.06998618086885643,"524":-0.04936393190534495,"525":0.11635808407221745,"526":0.112344060274565,"527":0.08112957590071306,"528":0.13458871653033838,"529":0.23408727054434852,"530":-0.12150626417218703,"531":-0.0704600357731027,"532":0.04290085938670844,"533":-0.13944036270607826,"534":-0.09207579403389156,"535":-0.13261996069534362,"536":0.07933655553141433,"537":-0.22691851358444123,"538":0.022018944427391392,"539":0.017365951338986742,"540":0.0424645677501093,"541":-0.17285564863270955,"542":-0.04351225797420849,"543":0.13637017700348328,"544":-0.15310858018020693,"545":-0.05492477632117109,"546":-0.12635160267185058,"547":0.07484165492155921,"548":-0.1486199950012747,"549":0.10458619922727223,"550":-0.21988710904339265,"551":0.03727056622863024,"552":-0.037709526884954624,"553":0.16119195552515128,"554":-0.0752908072296055,"555":0.13544333845146658,"556":-0.10325388267009133,"557":0.07857319367468342,"558":0.03760136530777616,"559":-0.010503880388833887,"560":0.03001202327410864,"561":0.05972539286225241,"562":0.024220511293540314,"563":0.02029936615664401,"564":-0.07547408890882605,"565":0.22427944405735786,"566":-0.1499315254761833,"567":0.024904669119951366,"568":0.10251552851202086,"569":0.13892326671342778,"570":-0.21992248117249322,"571":0.1802376069728553,"572":0.18888943748287607,"573":-0.2093493269675319,"574":0.061405026320000805,"575":-0.12689876588882726,"576":0.0131142091610316,"577":-0.1723869880637264,"578":0.008530255428282129,"579":0.19530236753795588,"580":-0.14949767451171356,"581":-0.06987730665173641,"582":-0.19575442763424708,"583":-0.08371122321115752,"584":0.09082654023935618,"585":0.05482764136935002,"586":-0.12250316586915783,"587":-0.003796021466615515,"588":-0.22330405890304336,"589":-0.11618017428640419,"590":-0.09091680522198485,"591":-0.2189842013485002,"592":-0.05496207324922232,"593":-0.0355751259525649,"594":-0.16779042724475388,"595":-0.16044409293311535,"596":-0.11286944541523314,"597":-0.16534764874947497,"598":-0.2055224168715611,"599":-0.028897216504335223,"600":-0.11074570641023918,"601":-0.08342070684170037,"602":0.09952851017420626,"603":-0.11666540089730625,"604":0.13644769487300362,"605":-0.18904779831767998,"606":0.1868793821813673,"607":0.1589658175034808,"608":-0.011506043102353447,"609":0.05270304258028002,"610":0.05057711331572322,"611":-0.19506963429357788,"612":-0.16212340642233142,"613":0.026378460516573037,"614":-0.0739577335334945,"615":-0.15873665865992864,"616":0.008171160842786334,"617":0.038681660742557154,"618":0.011056193890397626,"619":-0.07670603449277749,"620":-0.07198777507911493,"621":0.0008895941042607254,"622":-0.14906706092249447,"623":0.0891944051054961,"624":0.012197320043492058,"625":0.02641656548856083,"626":0.16428720927688711,"627":-0.13643017765042717,"628":0.1762769667943494,"629":-0.13384779665048616,"630":0.19182736787130306,"631":-0.08630412324878234,"632":-0.00862885466863183,"633":-0.13073979080335082,"634":0.03905589114246455,"635":0.1712510608610112,"636":0.044637259817567804,"637":-0.17598154090478288,"638":-0.21239697160871643,"639":-0.06854897893904528,"640":-0.13606646509732395,"641":0.08526194843399638,"642":0.08535098101760387,"643":-0.005641593007076575,"644":0.0036804745562638457,"645":-0.1087960683852281,"646":-0.14759751354683207,"647":0.16946769282341023,"648":0.04873757336766188,"649":-0.1398172904239827,"650":-0.1665249392176831,"651":-0.02394247888530779,"652":0.1177516989934872,"653":0.07637974867757294,"654":0.16477732879345058,"655":0.13578150790087765,"656":0.005199656188090345,"657":0.035588647802081264,"658":0.14655560338893625,"659":0.1391140164615535,"660":-0.1719111857648917,"661":-0.14235979575275323,"662":0.14292389397390776,"663":-0.023875200192723288,"664":0.04877546962432896,"665":-0.0783578633209007,"666":-0.03260076250636854,"667":0.14349229289565188,"668":-0.10996092348211615,"669":0.025104291038501425,"670":-0.06401418909555213,"671":-0.03850925945194575,"672":0.15690003908250713,"673":-0.050469513295627155,"674":0.09357259944649231,"675":0.1381253659265817,"676":-0.06929753898856679,"677":0.19831521935092572,"678":0.034273561855028854,"679":-0.13330466849017822,"680":-0.14425762817291518,"681":-0.24296599460332524,"682":0.1572414516814633,"683":-0.15712844692993239,"684":-0.13130706912613987,"685":-0.2148128658176266,"686":-0.17636654029128288,"687":-0.10514189200897157,"688":0.15741114806899506,"689":-0.03996337947635306,"690":-0.1872734423765229,"691":-0.02674297516818662,"692":-0.08371846457339886,"693":0.08974909584190517,"694":0.04090561747509421,"695":-0.11329425874193898,"696":0.13239561408705328,"697":0.06851069863415145,"698":0.051878070677173295,"699":0.017285804255795702,"700":-0.17701637942592482,"701":0.02675569824046791,"702":-0.1687385539009928,"703":0.0609345076385352,"704":0.14326907442168613,"705":0.10130650044801466,"706":0.0593121110946847,"707":0.1510870068414051,"708":0.05291061457608804,"709":0.12368633892649115,"710":-0.11371431970210877,"711":-0.0457011055862427,"712":-0.08372140438758395,"713":0.24509447424470665,"714":-0.15863890850290943,"715":0.04117016820692189,"716":-0.20779250314613232,"717":-0.06822576054548081,"718":-0.07430214291005575,"719":-0.18244289004116665,"720":0.1145805136291353,"721":0.1818452843683431,"722":0.031265492513406934,"723":0.1363322147810712,"724":0.10828677431918876,"725":-0.10718662859039071,"726":0.06645860968690313,"727":0.04608197694401722,"728":0.05714363287800436,"729":-0.08645608243851058,"730":-0.0016730071608990359,"731":-0.17290478951950292,"732":-0.14741352575615424,"733":0.21207612736722442,"734":0.0030193952677141736,"735":0.05841615977670124,"736":-0.1122662942440581,"737":-0.11127788025468793,"738":0.10492702383106475,"739":0.17848282200599866,"740":-0.113767605589035,"741":-0.059891353872536,"742":0.11013971238868803,"743":0.10094993396374356,"744":-0.05092390051767813,"745":-0.13063267956304644,"746":-0.0907709166825483,"747":-0.09566050701935741,"748":-0.1377310608604718,"749":-0.013284074804400215,"750":-0.11707919474449748,"751":-0.06073486570413371,"752":-0.1702351748455793,"753":-0.06253625461954877,"754":-0.16622433450588073,"755":-0.18593446534745192,"756":-0.03056766984294901,"757":0.10265631197687188,"758":-0.17607069011514725,"759":-0.07292433724626514,"760":-0.035070360341542484,"761":-0.1437277038188588,"762":0.06206365482393149,"763":0.07015183110970406,"764":-0.18080682550797006,"765":-0.1582844104698784,"766":0.023787832688511652,"767":0.05249735612548672,"768":-0.02672439187371524,"769":0.002250207765095518,"770":-0.05075834296960744,"771":-0.1585056715361344,"772":-0.031241258764660877,"773":-0.17921026074156896,"774":0.18775425716340874,"775":-0.035207682860027394,"776":-0.024878639457703605,"777":-0.12993598213397442,"778":0.04973656345736554,"779":-0.14021181267355112,"780":0.06076322033333602,"781":0.008865917744081948,"782":0.07471948581316196,"783":-0.013298221620427104,"784":0.14650017959573428,"785":0.05375131417897387,"786":-0.04172495693770143,"787":-0.13369871061926009,"788":-0.053202544142669776,"789":-0.1720194554714968,"790":0.14927024366966096,"791":0.04446986900225808,"792":0.13461354576972437,"793":0.0619056558907457,"794":-0.025609610830339778,"795":-0.07706163028170351,"796":-0.08089185629840158,"797":-0.18526187683369544,"798":0.03828594730833538,"799":0.19939318911971235,"800":-0.031115403865335723,"801":-0.16384171252206714,"802":0.09760749117435163,"803":-0.08205817710120515,"804":0.08731447257218539,"805":-0.01067631560948004,"806":-0.010021006617387947,"807":-0.15951833224541773,"808":0.13899477474534497,"809":-0.017378310245129588,"810":-0.13723797952262426,"811":0.1426240779750328,"812":-0.06095641801603629,"813":0.022679605994206518,"814":0.0574664287871424,"815":-0.17628778915251658,"816":-0.132317755313888,"817":-0.17967331682626192,"818":-0.02638187012678399,"819":0.06747690112131097,"820":0.04854562912632599,"821":-0.10299522529860455,"822":0.1516421898072484,"823":0.047822957221982335,"824":-0.21310266145455675,"825":-0.12175396652842686,"826":-0.008636029881432292,"827":0.0967339435182216,"828":-0.069778702183876,"829":-0.1626927823043148,"830":-0.19059486191848057,"831":-0.21453447464527678,"832":0.02760249731883119,"833":-0.09720769283572255,"834":-0.025612766122480365,"835":-0.14993656006486358,"836":0.1980020940264655,"837":0.05249440645134502,"838":0.168690857984364,"839":0.14370839241349948,"840":0.2123391597430379,"841":-0.18963619460713588,"842":0.03510305428868674,"843":-0.121867196546213,"844":0.10126739368815214,"845":0.07082943331879088,"846":0.04577736964206865,"847":0.07797888526530321,"848":-0.007064905207921719,"849":0.09328445138439188,"850":-0.0770458163004058,"851":-0.0009219845997495551,"852":0.16904864747338263,"853":0.07816783858633936,"854":-0.1960284366124766,"855":-0.08752520407887636,"856":-0.0908172806427483,"857":-0.08725113424488955,"858":-0.11434370329815848,"859":0.08620629983087506,"860":-0.03274468226020088,"861":-0.02421320483493763,"862":0.14593913209768047,"863":0.1941553506478996,"864":0.1408468815538658,"865":0.08615215351379876,"866":-0.012399747852586825,"867":-0.18417812208926454,"868":-0.057431204041190016,"869":0.17667653609788506,"870":-0.038877151395235114,"871":0.09830522858372454,"872":-0.029486211234241066,"873":-0.06722354147421686,"874":0.030742460099933724,"875":0.1308129007387715,"876":-0.1079258558600639,"877":0.1323791744520885,"878":-0.058625984807563696,"879":-0.09476716518866611,"880":0.17142821831657706,"881":-0.07812985719985058,"882":0.050751904044265994,"883":-0.06522331340805612,"884":-0.220338586816427,"885":0.04286864641257593,"886":0.2058881734932775,"887":-0.011896134467798736,"888":-0.12191244910846283,"889":0.06126470729264123,"890":0.1265055259818851,"891":-0.18501782828306915,"892":0.1013782233601127,"893":0.18839515166229812,"894":-0.08770073264666106,"895":-0.18913175329292775,"896":-0.019637131815930093,"897":0.11160688371013719,"898":0.1348304136630932,"899":-0.08189440441397268,"900":-0.06690166289877392,"901":-0.14142143613817573,"902":0.07831394580542013,"903":0.04410386130732715,"904":0.2533371811752464,"905":0.2536849996131917,"906":-0.04854227659859108,"907":0.022700233269471053,"908":0.10539931244298648,"909":-0.03975575260827867,"910":0.1710574375907101,"911":-0.18940190989314548,"912":-0.20491615564660784,"913":-0.11967343900518278,"914":0.12145136493135203,"915":-0.21240721656351652,"916":-0.0952478291718013,"917":0.11170678445680847,"918":-0.05830453239167452,"919":-0.20657308642763408,"920":0.12968568237898642,"921":-0.060141807284954905,"922":0.09541187529116629,"923":-0.05329798345624671,"924":-0.195062201269849,"925":-0.11672673909222048,"926":0.031792825834287164,"927":0.156787703916899,"928":-0.008155360220399003,"929":-0.04970830032218635,"930":0.08651455087425919,"931":-0.025027958521967836,"932":-0.08202947761528036,"933":0.1738950868627796,"934":0.0324201525277784,"935":-0.09800428154287644,"936":0.04791566879398267,"937":-0.1862718519947673,"938":-0.005104402179129904,"939":0.08265503640038578,"940":-0.125986127438399,"941":-0.1633013446325797,"942":0.006286078323804931,"943":0.09613905361384492,"944":-0.06311067229989008,"945":-0.03150134489292466,"946":-0.20026211598022237,"947":0.0012964600426751162,"948":-0.10858531154373084,"949":0.0294040091154662,"950":-0.008676008802793123,"951":-0.21492604734745346,"952":0.029892560693912027,"953":-0.08029615009896243,"954":0.061582408055740126,"955":-0.0761573592623253,"956":0.07313919567340993,"957":-0.11575427007497915,"958":0.10375509679489063,"959":-0.06990504094217695,"960":0.025724433688571368,"961":-0.01317425078468006,"962":-0.042721247771095136,"963":0.05940961885213447,"964":-0.021064751285660214,"965":0.11653531934686039,"966":0.0896489456255329,"967":-0.1542071795273558,"968":-0.014905106592407331,"969":0.018795955821598452,"970":0.046680670286685086,"971":-0.01641436248607841,"972":0.14042601925961865,"973":0.03718560704559051,"974":0.008371402546138733,"975":-0.011450845546448325,"976":0.17814479040504477,"977":0.03595904936577855,"978":-0.12197629487956771,"979":0.11421890159952393,"980":0.03636111379097163,"981":0.11523066243883803,"982":-0.210833643332135,"983":0.18802869143201467,"984":0.03790276284753617,"985":-0.08885512764238356,"986":-0.11848078111532394,"987":-0.04656263632009287,"988":-0.148124752365113,"989":0.06316155883779877,"990":-0.09173222945420685,"991":0.20101983711416688,"992":0.09624357012599655,"993":0.04191127989528869,"994":-0.08935464982557699,"995":0.15324775357003156,"996":-0.04717386453782813,"997":-0.13106270330592817,"998":-0.16473417102392238,"999":-0.01743941251172802,"1000":-0.051313860913934785,"1001":-0.03244949537567968,"1002":-0.1087116821529464,"1003":-0.052734459620339263,"1004":0.16580759452286223,"1005":0.08886955584235326,"1006":0.06498413694487089,"1007":0.18578546619541195,"1008":0.22642360174979356,"1009":-0.15650336462983339,"1010":0.1621277558023498,"1011":-0.11398560445465904,"1012":-0.19093807255397524,"1013":0.17360124053562,"1014":0.18782627885911513,"1015":0.09514317005942498,"1016":0.089337829057119,"1017":-0.06900748153471785,"1018":-0.0021212073004512784,"1019":-0.1050192326193327,"1020":-0.03496357489021198,"1021":0.022925022647328243,"1022":-0.20511647689658344,"1023":-0.08011971853717605,"1024":0.07499653696402617,"1025":-0.09642675377632103,"1026":0.03516058741614901,"1027":-0.1674534025111993,"1028":-0.008060353809165914,"1029":-0.2051997655067181,"1030":-0.09122261546517159,"1031":0.16312374656409273,"1032":0.025507701430980724,"1033":0.07947708996070495,"1034":0.065226997276545,"1035":-0.00417802518080093,"1036":-0.13184448089235618,"1037":-0.1348056461284195,"1038":-0.05015897669365704,"1039":0.10929249547574055,"1040":-0.013875746790450543,"1041":0.117626625537994,"1042":-0.12034019694805373,"1043":0.00821773264688269,"1044":0.11154289523282326,"1045":-0.1913052443178538,"1046":-0.06860045237701068,"1047":0.1345703079497851,"1048":-0.06421311865522983,"1049":0.05784815893662481,"1050":-0.007293301687244015,"1051":0.17302119727935145,"1052":-0.09569317569938883,"1053":0.04057988407467757,"1054":0.18552161659128044,"1055":-0.17172116696452652,"1056":-0.18621421629231036,"1057":-0.010981766246562628,"1058":-0.181036462306103,"1059":-0.18466921872407116,"1060":0.15434764965049844,"1061":0.061848574361503136,"1062":-0.17703173838212624,"1063":0.05153559536253958,"1064":-0.13741103108610744,"1065":-0.009609904700866168,"1066":-0.08375011610425105,"1067":0.15429308400080738,"1068":-0.010508648815722759,"1069":0.1262849015359611,"1070":-0.14180764703861226,"1071":-0.025787145710838993,"1072":0.1571448409792806,"1073":-0.026858702857370072,"1074":0.13428026693462358,"1075":-0.16113463006546483,"1076":0.06369217440003179,"1077":-0.0869754770805744,"1078":0.12876425723968463,"1079":0.17887755967733704,"1080":-0.042697150627620827,"1081":0.004874071596522761,"1082":-0.16637770615644562,"1083":-0.15945108733124333,"1084":-0.1556554025827927,"1085":0.151034274529635,"1086":-0.014449115833000088,"1087":-0.18532285053153646,"1088":-0.006729311611298982,"1089":0.07800950650568346,"1090":0.11218344904589957,"1091":-0.19325737708910862,"1092":-0.13952895038780155,"1093":-0.19940667704863535,"1094":-0.11961807689516782,"1095":0.014215335873583172,"1096":0.11970366953856075,"1097":-0.06425917337249928,"1098":0.02012136554833902,"1099":0.14241656135388595,"1100":0.18253685639342251,"1101":-0.09748932010931574,"1102":-0.18014925395604572,"1103":-0.023998006621508288,"1104":-0.09442639082320962,"1105":-0.11884762221986599,"1106":0.022072235311887112,"1107":-0.011696080067159864,"1108":0.0455194832350107,"1109":-0.1481581971906951,"1110":-0.08374181599970827,"1111":-0.1083924521700961,"1112":-0.15641711048959347,"1113":-0.14348620726886005,"1114":0.0720135572152228,"1115":-0.11760922947759885,"1116":0.08404016792824855,"1117":0.009855005846467455,"1118":-0.023588877387127626,"1119":-0.12686324730005039,"1120":-0.03659150558783713,"1121":0.1277089295133556,"1122":0.05566941255535806,"1123":0.1842434082332088,"1124":-0.03331808662139224,"1125":-0.059878890421589295,"1126":-0.1825874153570316,"1127":0.1719412017248239,"1128":-0.08799758545149547,"1129":-0.15981511404094495,"1130":-0.06310710050820863,"1131":0.08802202018540037,"1132":-0.1859045161630421,"1133":0.15306248818735568,"1134":-0.03327723337883353,"1135":0.1414303621379269,"1136":-0.11022567143253847,"1137":0.1185018015883481,"1138":-0.1747459861549766,"1139":-0.06103802181959306,"1140":0.00980281773914009,"1141":0.13857769088316907,"1142":-0.1085325173560926,"1143":-0.10462080482535858,"1144":-0.12196678903798398,"1145":0.005940283637603112,"1146":0.15836782259316967,"1147":0.08186188971198025,"1148":0.1430012236789289,"1149":0.12682384291235071,"1150":0.15137970070404602,"1151":-0.13560823179665432,"1152":0.04070245521434021,"1153":0.085035182542619,"1154":-0.05683653535532088,"1155":0.01983707385694118,"1156":0.006187331982320787,"1157":0.15710014052072008,"1158":-0.07470361378333601,"1159":0.07597349073091413,"1160":0.09727883519375419,"1161":-0.226392304088367,"1162":0.02177733263192995,"1163":0.11742229694842551,"1164":0.126148624038831,"1165":0.09020962805644743,"1166":0.20085334367431876,"1167":-0.07285315245599619,"1168":0.12572242533127326,"1169":0.03230289838507727,"1170":0.162679777631739,"1171":0.11984272515569662,"1172":0.05348148515531597,"1173":-0.18252599487015655,"1174":-0.019213044643501237,"1175":0.19408473050266237}}},{"0":{"bias":0.09612344067974866,"weights":{"0":-0.269548499558728,"1":-0.10395579667501431,"2":0.041964007130288396,"3":-0.12083488197022797,"4":-0.1693672305380543,"5":-0.12492626611835715,"6":0.19703914731807917,"7":0.24786072152017366,"8":0.1325151957782802,"9":0.2323262465943799}},"1":{"bias":-0.29661501263597995,"weights":{"0":-0.44688187326437734,"1":0.16356820323267757,"2":0.5606770511030822,"3":-0.1450905212666971,"4":-0.17388174830118644,"5":-0.5924645567585085,"6":0.4776196141398126,"7":0.3542873338016727,"8":0.8398998301239143,"9":0.3476219524612187}},"2":{"bias":0.08128371688936233,"weights":{"0":0.4832888692878267,"1":-0.3548713103566183,"2":-0.4896046736324197,"3":0.08413935068871638,"4":0.036557215881224514,"5":0.5047691398157397,"6":-0.16068489347164733,"7":-0.13131522042267116,"8":-0.7032252104797666,"9":-0.4225043433579997}},"3":{"bias":-0.08328792421685369,"weights":{"0":-0.5756616086504387,"1":0.10978364050044036,"2":0.5068214105693026,"3":-0.14519111242492475,"4":-0.09226146033366993,"5":-0.5387653665464168,"6":0.5791071767445426,"7":0.15623269929485573,"8":0.6691627267520904,"9":0.3348577052685226}},"4":{"bias":-0.2085230561955993,"weights":{"0":-0.21767722745981002,"1":0.1670646093450984,"2":0.0755827013518992,"3":-0.1486626943260832,"4":0.033205073252982775,"5":-0.14873520949607874,"6":0.28135143323090284,"7":0.10239588204174757,"8":0.2548501344475495,"9":0.176658347966603}},"5":{"bias":-0.10627173224512956,"weights":{"0":0.004636426259602,"1":-0.052885046957660546,"2":0.1098833135775006,"3":-0.14113876285590488,"4":-0.15173732209290267,"5":-0.14142668414481246,"6":-0.07533661189739022,"7":0.13977933149560476,"8":0.0982926088960381,"9":-0.17213715452615486}},"6":{"bias":0.049750210600199136,"weights":{"0":0.3395705225851689,"1":-0.10137353637204713,"2":-0.2485907866578455,"3":0.19131110036206259,"4":0.10380522350704283,"5":0.21270688419104608,"6":-0.23193307287572235,"7":-0.28617389220581,"8":-0.4510488932906816,"9":-0.43161580531809374}},"7":{"bias":0.36068906797800915,"weights":{"0":0.8940241779205558,"1":-0.4983903851685312,"2":-0.8187913463802328,"3":0.3883692060281371,"4":0.4262710102138127,"5":1.4460105569719004,"6":-0.9409560102829043,"7":-0.6497961764624413,"8":-1.3788262788846972,"9":-0.7215878837869405}},"8":{"bias":-0.1270055839654954,"weights":{"0":0.1629884243092988,"1":-0.10208997929438417,"2":-0.20312716388859123,"3":0.12707458001650493,"4":-0.16793883987667224,"5":0.20061500120752948,"6":-0.04623642170037477,"7":-0.12746477292188613,"8":-0.07242529098528705,"9":-0.14154689252558203}},"9":{"bias":-0.13375311983603294,"weights":{"0":-0.5659465198697482,"1":0.2850490015112885,"2":0.4325301209476689,"3":-0.17665818328034577,"4":-0.04912213044250274,"5":-0.8217801504469316,"6":0.5698691548234139,"7":0.49986260425080803,"8":0.5535538500115039,"9":0.2960538693198391}}},{"0":{"bias":-0.14711605007404643,"weights":{"0":0.43256622255712424,"1":1.5202373441290264,"2":-1.2333918356898002,"3":1.400221662221386,"4":0.51727196101118,"5":0.12393704611155332,"6":-0.8506168255653058,"7":-3.189922001026183,"8":-0.3474586067406303,"9":1.5366261980446907}}}]}
});

require.define("/repos/kittydar/kittydar.js", function (require, module, exports, __dirname, __filename) {
    var brain = require("brain"),
        hog = require("hog-descriptor");

    var network = require("./network.js");

    var net = new brain.NeuralNetwork().fromJSON(network);

    if (process.arch) {
        // in node
        var Canvas = (require)('canvas');
    }

    function createCanvas (width, height) {
        if (typeof Canvas !== 'undefined') {
            // have node-canvas
            return new Canvas(width, height);
        }
        else {
            // in browser
            var canvas = document.createElement('canvas');
            canvas.setAttribute('width', width);
            canvas.setAttribute('height', height);
            return canvas;
        }
    }

    var kittydar = {
        patchSize: 48,       // size of training images in px

        minSize: 48,         // starting window size

        resize: 360,         // initial image resize size in px

        threshold: 0.96,   // probablity threshold for classifying

        scaleStep: 6,        // scaling step size in px

        shiftBy: 12,          // px to slide window by

        overlapThresh: 0.8,  // min overlap ratio to classify as an overlap

        minOverlaps: 1,      // minumum overlapping rects to classify as a head

        HOGparams: {         // parameters for HOG descriptor
            cellSize: 6,
            blockSize: 2,
            blockStride: 1,
            bins: 6,
            norm: "L2"
        },
        createContext: function(width, height) {

            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas.getContext("2d");
        },
        detectCats: function(canvas, options) {
            this.setOptions(options || {});

            //begin
            var ctx = canvas.getContext("2d");
            ctx.patternQuality="best";
            var imagedata = ctx.getImageData(0,0,canvas.width,canvas.height);
            var resizes = [];
            resizes.push({
                imagedata: imagedata,
                scale: 1,
                size: 48
            })
            //end
            var cats = [];
            resizes.forEach(function(resize) {
                var kitties = kittydar.detectAtScale(resize.imagedata, resize.scale);
                cats = cats.concat(kitties);
            });
            cats = this.combineOverlaps(cats);
            return cats;
        },

        setOptions: function(options) {
            for (var opt in options) {
                this[opt] = options[opt];
            }
        },



        scaleCanvas: function(canvas, scale) {
            var width = Math.floor(canvas.width * scale);
            var height = Math.floor(canvas.height * scale);

            canvas = resizeCanvas(canvas, width, height);
            var ctx = canvas.getContext("2d");
            var imagedata = ctx.getImageData(0, 0, width, height);

            return imagedata;
        },

        isCat: function(vectors) {
            var features = hog.extractHOGFromVectors(vectors, this.HOGparams);

            var prob = net.runInput(features)[0];
            return prob;
        },

        detectAtScale: function(imagedata, scale) {
            // Detect using a sliding window of a fixed size.
            // var vectors = hog.gradientVectors(imagedata);
            var cats = [];
            var i = 0;
            var width = imagedata.width,
                height = imagedata.height;
            //add
            //draw the image to canvas
            var canvas1 = document.createElement('canvas');
            canvas1.width = width;
            canvas1.height = height;
            var context = canvas1.getContext("2d");
            context.putImageData(imagedata,0,0);
            //end
            var size = this.patchSize;
            var x0=0;
            var maxHeight =71, maxWidth = 213,
                minWidth= 44, minHeight=16,
                xShift=25,
                yShift=10, heightShift=10;
            for(var heightScan= maxHeight; heightScan > minHeight; heightScan-=heightShift)
            {
                for (var y = 0; y + heightScan < height; y +=yShift) {
                    for (var x = 0; maxWidth-x> minWidth; x += xShift) {
                        var cat_context = kittydar.drawPart(canvas1,x0,y,maxWidth-x,heightScan);
                        var vectors = hog.gradientVectors(cat_context);
                        var win = getRect(vectors, 0, 0, size, size);

                        var prob = this.isCat(win);

                        if (prob > this.threshold) {
                            cats.push({
                                x: Math.floor(x0 / scale),
                                y: Math.floor(y / scale),
                                width: Math.floor(maxWidth-x / scale),
                                height: Math.floor(heightScan / scale),
                                prob: prob
                            });
                        }
                    }
                }
            }
            return cats;
        },

        //get image data of all sub frames for using with web worker
        getAllImageData: function (canvas)
        {
//            var cats = new Array()  ;  //array contains all frame
            //end
            var height = canvas.height;

            var x0=0;
            var maxHeight =71, maxWidth = 213,
                minWidth= 44, minHeight=16,
                xShift=25,
                yShift=10, heightShift=10;
            var rects = new Array();
            for(var heightScan= maxHeight; heightScan > minHeight; heightScan-=heightShift)
            {
                for (var y = 0; y + heightScan < height; y +=yShift) {
                    for (var x = 0; maxWidth-x> minWidth; x += xShift) {
                        rects.push({
                                x: x0,
                                y:y,
                                width: maxWidth-x,
                                height:heightScan
                            });
//                        cats.push ({
//                            data:kittydar.drawPart(canvas,x0,y,maxWidth-x,heightScan),
//                            rect : {
//                                x: Math.floor(x0),
//                                y: Math.floor(y),
//                                width: Math.floor(maxWidth-x),
//                                height: Math.floor(heightScan)
//                            }
//                        });
                    }
                }
            }
            return kittydar.getImagesData(canvas,rects);
        },

        getAllImageData: function (canvas)
        {
            // var cats = new Array()  ;  //array contains all frame
            //end
            var height = canvas.height;
            var x0=0;
            var maxHeight =71, maxWidth = 213,
                minWidth= 44, minHeight=16,
                xShift=25,
                yShift=10, heightShift=10;
            var rects = new Array();
            for(var heightScan= maxHeight; heightScan > minHeight; heightScan-=heightShift)
            {
                for (var y = 0; y + heightScan < height; y +=yShift) {
                    for (var x = 0; maxWidth-x> minWidth; x += xShift) {
                        rects.push({
                            x: x0,
                            y:y,
                            width: maxWidth-x,
                            height:heightScan
                        });
//                        cats.push ({
//                            data:kittydar.drawPart(canvas,x0,y,maxWidth-x,heightScan),
//                            rect : {
//                                x: Math.floor(x0),
//                                y: Math.floor(y),
//                                width: Math.floor(maxWidth-x),
//                                height: Math.floor(heightScan)
//                            }
//                        });
                    }
                }
            }
            return rects;
            //   return kittydar.getImagesData(canvas,rects);
        },
        //for using with webworker
        detectInImageData: function(imageData)
        {
            var cats = [];
            var vectors = hog.gradientVectors(imageData.data);
            var win = getRect(vectors, 0, 0, this.patchSize, this.patchSize);
            var prob = this.isCat(win);
            if (prob > this.threshold) {
                cats.push({
                    x: imageData.rect.x,
                    y:imageData.rect.y,
                    width: imageData.rect.width,
                    height: imageData.rect.height,
                    prob: prob
                });
            }
            return cats;

        },

        drawPart : function (canvas, x, y, width, height)
        {
            //get image data of the scaled image
//      var canvas1 = $("#test").get(0);
//      canvas1.width = 48;
//      canvas1.height = 48;
            var context = canvas.getContext("2d");
            context.patternQuality="best";
            context.drawImage(canvas,x,y,width,height,0,0,48,48);
            return context.getImageData(0,0,48,48);

        },
        combineOverlaps: function(rects, overlap, min) {
            // non-maximum suppression - remove overlapping rects
            overlap = overlap || this.overlapThresh;
            min = min || this.minOverlaps;

            for (var i = 0; i < rects.length; i++) {
                var r1 = rects[i];
                r1.tally = 0; // number of rects it's suppressed

                for (var j = 0; j < i; j++) {
                    r2 = rects[j];

                    if (doesOverlap(r1, r2)) {
                        if (r1.prob > r2.prob) {
                            r2.suppressed = true;
                            r1.tally += 1 + r2.tally;
                        }
                        else {
                            r1.suppressed = true;
                            r2.tally += 1 + r1.tally;
                        }
                    }
                }
            }
            // only take a rect if it wasn't suppressed by any other rect
            return rects.filter(function(rect) {
//      return !rect.suppressed && rect.tally >= min;
                return !rect.suppressed
            })
        }
    }

    function getRect(matrix, x, y, width, height) {
        var square = new Array(height);
        for (var i = 0; i < height; i++) {
            square[i] = new Array(width);
            for (var j = 0; j < width; j++) {
                square[i][j] = matrix[y + i][x + j];
            }
        }
        return square;
    }

    function resizeCanvas(canvas, width, height) {
        var resizeCanvas = createCanvas(width, height);
        var ctx = resizeCanvas.getContext('2d');
        ctx.patternQuality = "best";

        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height,
            0, 0, width, height);
        return resizeCanvas;
    }

    function doesOverlap(r1, r2, overlap) {
        overlap = overlap || 0.7;

        var overlapW, overlapH;
        if (r1.x > r2.x) {
            overlapW = Math.min((r2.x + r2.width) - r1.x, r1.width);
        }
        else {
            overlapW = Math.min((r1.x + r1.width) - r2.x, r2.width);
        }

        if (r1.y > r2.y) {
            overlapH = Math.min((r2.y + r2.height) - r1.y, r1.height);
        }
        else {
            overlapH = Math.min((r1.y + r1.height) - r2.y, r2.height);
        }

        if (overlapW <= 0 || overlapH <= 0) {
            return false;
        }
        var intersect = overlapW * overlapH;
        var union = (r1.width * r1.height) + (r2.width * r2.height) - intersect*2;

        if (intersect / union > overlap) {
            return true;
        }
        return false;
    }


    module.exports = kittydar;

});
var kittydar = require("/repos/kittydar/kittydar.js");

function sleep(ms)
{
    var dt = new Date();
    dt.setTime(dt.getTime() + ms);
    while (new Date().getTime() < dt.getTime());
}
