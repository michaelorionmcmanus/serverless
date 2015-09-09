'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */

// TODO: Add region into jaws-cf template using pseudo params via CF

// Defaults
var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils'),
    inquirer = require('bluebird-inquirer'),
    chalk = require('chalk'),
    shortid = require('shortid'),
    extend = require('util')._extend, //OK per Isaacs and http://stackoverflow.com/a/22286375/563420
    Spinner = require('cli-spinner').Spinner;

Promise.promisifyAll(fs);

// Define Project
var project = {};

/**
 * Generate ASCII
 * @return string
 */

function _generateAscii() {

  var art = '';
  art = art + '       ____   _____  __      __  _________ ' + os.EOL;
  art = art + '      |    | /  _  \\/  \\    /  \\/   _____/ ' + os.EOL;
  art = art + '      |    |/  /_\\  \\   \\/\\/   /\\_____  \\  ' + os.EOL;
  art = art + '  /\\__|    /    |    \\        / /        \\ ' + os.EOL;
  art = art + '  \\________\\____|__  /\\__/\\__/ /_________/ ' + os.EOL;
  art = art + '' + os.EOL;
  art = art + '     *** The Server-less Framework ***     ' + os.EOL;

  return art;

}

/**
 * Get Answers
 *
 * @returns {Promise}
 * @private
 */
function _getAnswers(projName, stage, s3Bucket, lambdaRegion, notificationEmail, awsProfile) {
  // Greet
  console.log(chalk.yellow(_generateAscii()));

  // Define CLI prompts
  var prompts = [],
      overrideAnswers = {};

  if (!projName) {
    prompts.push({
      type: 'input',
      name: 'name',
      message: 'Type a name for your new project (max 20 chars. Aphanumeric and - only):',
      default: 'jaws-new',
    });
  } else {
    overrideAnswers.name = projName;
  }

  if (!stage) {
    prompts.push({
      type: 'input',
      name: 'stage',
      message: 'Which stage would you like to create? (you can import more later)',
      default: 'dev',
    });
  } else {
    overrideAnswers.stage = stage;
  }

  if (!s3Bucket) {
    prompts.push({
      type: 'input',
      name: 's3Bucket',
      message: 'What bucket should be used to store JAWS env var files for this project? (/JAWS/envVars/<stage> file ' +
      'will be created. This bucket should be specific to this project.)',
      default: 'jawsproject.yourdomain.com',
    });
  } else {
    overrideAnswers.s3Bucket = s3Bucket;
  }

  // Request Region - Only available AWS Lambda regions allowed
  if (!lambdaRegion) {
    prompts.push({
      type: 'rawlist',
      name: 'region',
      message: 'Which AWS Region would you like to use (can add more/change later)?',
      default: 'us-east-1',
      choices: [
        'us-east-1',
        'us-west-1',
        'eu-west-1',
        'ap-northeast-1',
      ],
    });
  } else {
    overrideAnswers.region = lambdaRegion;
  }

  if (!notificationEmail) {
    prompts.push({
      type: 'input',
      name: 'notificationEmail',
      message: 'Email would you like to use for AWS alarms:',
      default: '',
    });
  } else {
    overrideAnswers.notificationEmail = notificationEmail;
  }

  // Use existing or create new AWS CLI profile
  if (fs.existsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {

    var profilesList = AWSUtils.profilesMap(),
        profiles = Object.keys(profilesList);

    if (awsProfile && -1 !== profiles.indexOf(awsProfile)) {
      overrideAnswers.awsProfile = awsProfile;
    } else {
      prompts.unshift({
        type: 'rawlist',
        name: 'awsProfile',
        message: 'What AWS profile in ~/.aws/credentials should be used for your admin user?:',
        choices: profiles,
        default: profiles[0],
      });
    }
  } else {
    prompts.unshift({ //need to create aws creds profile (will use 'default')
      type: 'input',
      name: 'awsAdminKeyId',
      message: 'Please enter the ACCESS KEY ID for your ADMIN AWS IAM User:',
    }, {
      type: 'input',
      name: 'awsAdminSecretKey',
      message: 'Please enter the SECRET ACCESS KEY for your ADMIN AWS IAM User:',
    });
  }

  if (prompts.length > 0) {
    return inquirer.prompt(prompts)
        .then(function(answers) {
          return extend(answers, overrideAnswers);
        });
  } else {
    return Promise.resolve(overrideAnswers);
  }
}

/**
 * Prepare project data
 *
 * @param answers
 * @returns {Promise}
 * @private
 */
function _prepareProjectData(answers) {
  if (answers.stage.toLowerCase() == 'local') {
    Promise.reject(new JawsError(
        'Stage ' + answers.stage + ' is reserved',
        JawsError.errorCodes.UNKNOWN));
  }

  project.name = answers.name.toLowerCase().trim()
      .replace(/[^a-zA-Z-\d\s:]/g, '')
      .replace(/\s/g, '-')
      .substring(0, 19);

  // AWS only allows Alphanumeric and - in name
  var nameOk = /^([a-zA-Z0-9-]+)$/.exec(project.name);
  if (!nameOk) {
    Promise.reject(new JawsError(
        'Project names can only be alphanumeric and -',
        JawsError.errorCodes.INVALID_PROJ_NAME));
  }

  // Append unique id if name is in use
  if (fs.existsSync(path.join(process.cwd(), project.name))) {
    project.name = project.name + '-' + shortid.generate().replace(/[_-]/g, '');
  }

  // Set or Create Profile
  if (answers.awsProfile) {

    project.awsProfile = answers.awsProfile;

  } else {

    if (!answers.awsAdminKeyId) {
      reject(new JawsError(
          'An AWS Access Key ID is required',
          JawsError.errorCodes.MISSING_AWS_CREDS));
    }

    if (!answers.awsAdminSecretKey) {
      reject(new JawsError(
          'An AWS Secret Key is required',
          JawsError.errorCodes.MISSING_AWS_CREDS));
    }

    // Set profile
    AWSUtils.profilesSet('default', answers.region, answers.awsAdminKeyId, answers.awsAdminSecretKey);
    project.awsProfile = 'default';
  }

  // Set other project data
  project.stage = answers.stage;
  project.region = answers.region;
  project.notificationEmail = answers.notificationEmail.trim();
  project.s3Bucket = answers.s3Bucket;

  return Promise.resolve();
}

/**
 *
 * @returns {Promise}
 * @private
 */
function _createProjectDirectory() {

  // Set Root Path
  project.rootPath = path.resolve(path.join(path.dirname('.'), project.name));

  // Prepare admin.env
  var adminEnv = 'ADMIN_AWS_PROFILE=' + project.awsProfile + os.EOL;

  // Prepare CloudFormation template
  var cfTemplate = require('../templates/jaws-cf');
  cfTemplate.Parameters.aaProjectName.Default = project.name;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [project.name];
  cfTemplate.Parameters.aaStage.Default = project.stage;
  cfTemplate.Parameters.aaDataModelPrefix.Default = project.stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaNotficationEmail.Default = project.notificationEmail;

  // Create files
  return utils.writeFile(
      path.join(project.rootPath, 'back', '.env'),
      'JAWS_STAGE=' + project.stage + '\nJAWS_DATA_MODEL_PREFIX=' + project.stage
  )
      .then(function() {
        return Promise.all([
          fs.mkdirAsync(path.join(project.rootPath, 'front')),
          fs.mkdirAsync(path.join(project.rootPath, 'tests')),
          fs.mkdirAsync(path.join(project.rootPath, 'back/lambdas')),
          fs.mkdirAsync(path.join(project.rootPath, 'back/lib')),
          utils.writeFile(path.join(project.rootPath, 'admin.env'), adminEnv),
          utils.writeFile(path.join(project.rootPath, 'jaws-cf.json'), JSON.stringify(cfTemplate, null, 2)),
        ]);
      });
}

/**
 * Create s3 bucket (if DNE) and upload the 1st stage env var
 *
 * Format: <bucket>/JAWS/envVars/<projName>/<stage>
 *
 * @returns {Promise}
 * @private
 */
function _createS3JawsStructure() {
  return AWSUtils.createBucket(project.awsProfile, project.region, project.s3Bucket)
      .then(function() {
        var envFileContents = 'JAWS_STAGE=' + project.stage + '\nJAWS_DATA_MODEL_PREFIX=' + project.stage;
        return AWSUtils.putEnvFile(
            project.awsProfile,
            project.region,
            project.s3Bucket,
            project.name,
            project.stage,
            envFileContents);
      });
}

/**
 * Create CloudFormation Stack
 */

function _createCfStack() {

  // Show loading messages
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + project.stage +
      '" stage of your JAWS project. This doesn\'t cost anything, but takes around 5 minutes to set-up. Sit tight!';
  var spinner = new Spinner('%s Creating CloudFormation Stack...');

  console.log(message);
  spinner.setSpinnerString('|/-\\');
  spinner.start();

  return AWSUtils.cfCreateStack(
      project.awsProfile,
      project.region,
      project.rootPath,
      project.name,
      project.stage,
      project.notificationEmail
  )
      .then(function(cfData) {
        return AWSUtils.monitorCfCreate(cfData, project.awsProfile, project.region, spinner);
      });
}

/**
 * Create Project JSON
 *
 * @param cfOutputs. Optional
 * @returns {Promise} jaws json js obj
 * @private
 */
function _createProjectJson(cfOutputs) {

  var iamRoleArnLambda,
      iamRoleArnApiGateway;

  if (cfOutputs) {
    for (var i = 0; i < cfOutputs.length; i++) {
      if (cfOutputs[i].OutputKey === 'IamRoleArnLambda') {
        iamRoleArnLambda = cfOutputs[i].OutputValue;
      }

      if (cfOutputs[i].OutputKey === 'IamRoleArnApiGateway') {
        iamRoleArnApiGateway = cfOutputs[i].OutputValue;
      }
    }
  }

  var jawsJson = {
    name: project.name,
    version: '0.0.1',
    location: '<enter project\'s github repository url here>',
    author: 'Vera D. Servers <vera@gmail.com> http://vera.io',
    description: project.name + ': An ambitious, server-less application built with the JAWS framework.',
    project: {
      stages: {},
    },
  };

  jawsJson.project.stages[project.stage] = [];
  jawsJson.project.stages[project.stage].push({
    region: project.region,
    iamRoleArnLambda: iamRoleArnLambda || '',
    iamRoleArnApiGateway: iamRoleArnApiGateway || '',
  });

  jawsJson.project.envVarBucket = {
    name: project.s3Bucket,
    region: project.region,
  };

  fs.writeFileSync(path.join(project.rootPath, 'jaws.json'), JSON.stringify(jawsJson, null, 2));

  console.log('Your project "' +
      project.name +
      '" has been successfully created in the current directory.'
  );

  return Promise.resolve(jawsJson);
}

/**
 *
 * @param projName
 * @param stage
 * @param s3Bucket store things like env vars: <bucket>/JAWS/envVars/<proj-name>/<stage>. Create bucket if DNE
 * @param lambdaRegion
 * @param notificationEmail
 * @param awsProfile
 * @param noExeCf don't execute CloudFormation at the end
 * @returns {*}
 */
module.exports.create = function(projName, stage, s3Bucket, lambdaRegion, notificationEmail, awsProfile, noExeCf) {
  return _getAnswers(projName, stage, s3Bucket, lambdaRegion, notificationEmail, awsProfile)
      .then(_prepareProjectData)
      .then(_createS3JawsStructure) //see if bucket is avail first before doing work
      .then(_createProjectDirectory)
      .then(function() {
        if (noExeCf) {
          utils.logIfVerbose('No exec cf specified, updating proj jaws.json only');
          console.log('Project and env var file in s3 successfully created. CloudFormation file can be run manually');
          console.log('After creating CF stack, remember to put the IAM role outputs in your project jaws.json');

          return _createProjectJson();
        } else {
          return _createCfStack()
              .then(_createProjectJson);
        }
      });
};