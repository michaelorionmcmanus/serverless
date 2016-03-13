'use strict';

const SError   = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = BbPromise.promisifyAll(require('fs')),
  path         = require('path'),
  wrench       = require('wrench');

/**
 * Runtime base class that all Serverless Runtimes extend
 */

let SUtils;

class ServerlessRuntimeBase {

  constructor(S, name) {
    SUtils = S.utils;
    this.S      = S;
    this.name   = name;
  }

  /**
   * Scaffold
   * - Create scaffolding for a new function with this runtime
   */

  scaffold(func) {
    return BbPromise.resolve();
  }

  /**
   * Run
   * - Run a function with this runtime
   */

  run(func) {
    return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "run()" method`));
  }

  /**
   * Build
   * - Build a function with this runtime
   */

  build(func, stage, region) {
    return BbPromise.resolve();
  }

  /**
   * Install Function Dependencies
   */

  installDependencies(dir ) {
    return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "installDepedencies()" method`));
  }

  /**
   * Get Name
   */

  getName() {
    return this.name;
  }

  /**
   * Create Dist Dir
   * - Creates a distribution folder for this function in _meta/_tmp
   */

  _createDistDir(funcName) {

    let d       = new Date(),
      pathDist  = this.S.getProject().getRootPath('_meta', '_tmp', funcName + '@' + d.getTime());

    return BbPromise.resolve(function(resolve, reject) {
      try {
        fse.mkdirsSync(path.dirname(pathDist));
      } catch (e) {
        reject(new SError(`Error creating parent folders when writing this file: ${filePath}
      ${e.message}`));
      }
      resolve(pathDist);
    });
  }

  /**
   * Copy Function
   * - Create Dist Dir
   * - Copies function files to new dir
   * - Process any includes/excludes
   */

  _copyFunction(func, pathDist, stage, region) {

    let _this = this;

    // Copy Files To Dist Folder
    return BbPromise.try(() => {

      // Status
      SUtils.sDebug(`"${stage} - ${region} - ${func.getName()}": Copying in dist dir ${pathDist}`);

      // Extract the root of the lambda package from the handler property
      let handlerFullPath = func.getRootPath(func.handler.split('/')[func.handler.split('/').length - 1]);

      // Check handler is correct
      if (handlerFullPath.indexOf(func.handler) == -1) {
        throw new SError('This function\'s handler is invalid and not in the file system: ' + func.handler);
      }

      let packageRoot = handlerFullPath.replace(func.handler, '');

      return wrench.copyDirSyncRecursive(packageRoot, pathDist, {
        exclude: _this._exclude(func, pathDist, stage, region)
      });

    });
  }

  /**
   * Exclude Files
   * - Processes func.custom.excludePatterns
   */

  _exclude(func, pathDist, stage, region) {

    // Copy entire test project to temp folder, don't include anything in excludePatterns
    let excludePatterns = func.custom.excludePatterns || [];

    return function(name, prefix) {

      if (!excludePatterns.length) { return false;}

      let relPath = path.join(prefix.replace(pathDist, ''), name);

      return excludePatterns.some(sRegex => {
        relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

        let re        = new RegExp(sRegex),
          matches     = re.exec(relPath),
          willExclude = (matches && matches.length > 0);

        if (willExclude) {
          SUtils.sDebug(`"${stage} - ${region} - ${func.name}": Excluding - ${relPath}`);
        }

        return willExclude;
      });
    }
  }

  _copyDir(func, pathDist, stage, region) {
    return BbPromise.try(() => {

      // Status
      SUtils.sDebug(`"${stage} - ${region} - ${func.getName()}": Copying in dist dir ${pathDist}`);

      // Extract the root of the lambda package from the handler property
      let handlerFullPath = func.getRootPath(func.handler.split('/')[func.handler.split('/').length - 1]);

      // Check handler is correct
      if (handlerFullPath.indexOf(func.handler) == -1) {
        throw new SError('This function\'s handler is invalid and not in the file system: ' + func.handler);
      }

      let packageRoot = handlerFullPath.replace(func.handler, '');

      return wrench.copyDirSyncRecursive(packageRoot, pathDist, {
        exclude: this._exclude(func, pathDist, stage, region)
      });
    });
  }

  _afterCopyDir(func, pathDist, stage, region) {
    return BbPromise.resolve();
  }

  _generateIncludePaths(func, pathDist) {
    let compressPaths = [],
      ignore        = ['.DS_Store'],
      stats,
      fullPath;

    // Zip up whatever is in back
    let includePaths = func.custom.includePaths  || ['.'];

    includePaths.forEach(p => {

      try {
        fullPath = path.resolve(path.join(pathDist, p));
        stats    = fs.lstatSync(fullPath);
      } catch (e) {
        console.error('Cant find includePath ', p, e);
        throw e;
      }

      if (stats.isFile()) {

        compressPaths.push({
          name: p,
          path: fullPath
        });

      } else if (stats.isDirectory()) {

        let dirname = path.basename(p);

        wrench
          .readdirSyncRecursive(fullPath)
          .forEach(file => {

            // Ignore certain files
            for (let i = 0; i < ignore.length; i++) {
              if (file.toLowerCase().indexOf(ignore[i]) > -1) return;
            }

            let filePath = path.join(fullPath, file);
            if (fs.lstatSync(filePath).isFile()) {

              let pathInZip = path.join(dirname, file);

              compressPaths.push({
                name: pathInZip,
                path: filePath
              });
            }
          });
      }
    });

    return BbPromise.resolve(compressPaths);
  }

  getHandler(func) {
    return func.handler;
  }

}


module.exports = ServerlessRuntimeBase;
