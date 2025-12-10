---
date: "2022-03-25"
tags: ["tech", "webpack", "loader", "from-scratch"]
---
# Writing your own webpack loader

Webpack looks like a quite intimidating system, but having played around with
them, they are very simple. In this article we will be creating our own loader
from scratch and adding them to our webpack configuration.

## Basics of a loader

The core concept is a loader is basically a function that maps input to output.
Loaders have the requirement is being written in  the commonjs format, meaning
you work with `module.exports` and `require`. An basic example:

```javascript
module.exports = function stringReplacingLoader(input) {
    return input.replace("World", "Earth");
}
```

If you now use this with a webpack config like:

```javascript
// webpack.config.js
// ...
module.exports = {
    // ...
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [
                    {
                        loader: path.resolve('./string-replace-loader.cjs'),
                    },
                ],
            },
        ],
    },
};
```

## Options
Consuming options is also simple:

```javascript
module.exports = function stringReplacingLoader(input) {
    const options = this.getOptions(/* optional json schema */);
    return input.replace("World", "Earth");
}
```

Options can now be specified in the webpack like you have done for other loaders.

## Pitching loaders

Some loaders can do things without depending on the output of the previous
loaders. Loaders are pitched in opposite order than their resource creation order.

Image you have a pipeline like
`['git-annotate-loader', 'html-loader', 'markdown-loader']`, webpack first
pitches the git loader. This starts a git process to fetch the file creation
times. It then returns nothing, so control is given to the html loader. It does
nothing. Then the markdown loader it pitched, it also does nothing. Since we hit
the end, we then load the order from last to first. markdown-loader is given the
UTF-8 representation of the file, it transforms it into html. Then the html
loader wraps this in a string, replacing strings in images and wrapping it in a
javascript string in order to export it. We ten reach the git annotation loader
again, who then waits for the earlier started git process to end, after which it
applies the git modification date as an export to the  generated javascript file.

## Examples

* [My own custom json-tagger-file-loader](https://github.com/ferrybig/json-tagged-file-loader)
* [Loader that embeds the git creation and updated times during the build](https://github.com/ferrybig/www.ferrybig.nl/blob/master/git-annotate-loader.cjs)
