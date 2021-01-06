/* tslint:disable:linebreak-style no-unsafe-any no-submodule-imports no-relative-imports no-console */
/**
 * Veracode Community SAST Azure DevOps Extension
 *
 */

import * as tl from 'azure-pipelines-task-lib/task';
import * as trm from 'azure-pipelines-task-lib/toolrunner';
import * as tool from 'azure-pipelines-tool-lib/tool';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Get Agent.TempDirectory which is a temp folder that is cleaned after each pipeline job.
 * This is where we will store the Veracode Pipeline Scan tool and where we will store a
 * zip file to scan (if needed).
 */
const tempPath: string = <string>tl.getVariable('Agent.TempDirectory');

async function run(): Promise<void> {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        /**
         * This task will only work in a build pipeline to publish results to the Azure
         *  Pipeline (note that publishing is NOT supported in release pipelines. It is
         *  supported in multi stage pipelines, build pipelines, and yaml pipelines).
         */
        const hostType: string = <string>tl.getVariable('System.HostType');
        console.log('Agent Type: ' + `${hostType}`);

        if (hostType === 'release' || hostType === 'deployment') {
            throw new Error('Running this agent in a release pipeline is not supported (yet).');
        }

        // Get the agent platform
        const agentPlatform: string = process.platform;
        console.log('Agent Platform: ' + `${agentPlatform}`);

        // This extension only works on linux or MacOS Agents
        if (agentPlatform === 'win32') {
            throw new Error('This task does not work on windows (yet).');
        }

        // Get task inputs
        const baselineFile: string | undefined = <string>tl.getPathInput('baselineFile');
        let scanTarget: string = <string>tl.getInput('scanTarget', true);
        const minSeverity: string = <string>tl.getInput('minSeverity', true);
        const failBuild: boolean = <boolean>tl.getBoolInput('failBuild', true);
        let appName: string | undefined = <string>tl.getInput('appName');

        // Get VERACODE_API_ID environmental variable
        const VERACODE_API_ID: string = <string>tl.getVariable('VERACODE_API_ID');
        if (VERACODE_API_ID === '' || VERACODE_API_ID === undefined) {
            throw new Error('You must define the VERACODE_API_ID environmental variable.');
        }

        // Get VERACODE_API_KEY environmental variable
        const VERACODE_API_KEY: string = <string>tl.getVariable('VERACODE_API_KEY');
        if (VERACODE_API_KEY === '' || VERACODE_API_KEY === undefined) {
            throw new Error('You must define the VERACODE_API_KEY environmental variable.');
        }

        // Set appName to the project name if it was left blank
        if (appName === '' || appName === undefined) {
            appName = tl.getVariable('System.TeamProject');
        }

        console.log('Minimum severity to report on: ' + `${minSeverity}`);
        console.log('Baseline file: ' + `${baselineFile}`);
       
        // Prepare the input file or folder to be scanned
        scanTarget = await prepareScanTarget(scanTarget);
        console.log('Scan Target: ' + `${scanTarget}`);

        // Check the input file to make sure it is < 100 MB as the scanner does not support it
        // https://help.veracode.com/reader/tS9CaFwL4_lbIEWWomsJoA/keSyYhPseqTAGwmhLFy2yA
        const stats: fs.Stats = fs.statSync(scanTarget);
        const fileSizeInBytes: number = stats.size;
        const fileSizeInMb: number = fileSizeInBytes / 1000000;
        console.log('Scan Target File Size: '  + `${fileSizeInMb}` + ' MB.');

        if (fileSizeInMb > 100) {
            throw new Error('Scan Target is too big, please submit a file that is less than 100 MB.');
        }

        // Remove results.json if it already exists
        if (tl.exist((path.join(__dirname, 'results.json')))) {
            fs.unlinkSync(path.join(__dirname, 'results.json'));
            console.log('Found existing results.json, removing before scan.');
        }

        // Download the pipeline-scan-LATEST.zip file
        const toolDownload: string = await downloadVeracodeSast();
        console.log('Downloaded file: ' + `${toolDownload}`);

        // Extract the pipeline-scan.jar file
        const toolExtract: string = await extractVeracodeSast(toolDownload);
        console.log('Veracode SAST jar: ' + `${toolExtract}`);

        // Scan the code
        await runScan(toolExtract, scanTarget, VERACODE_API_ID, VERACODE_API_KEY, baselineFile);

        // Need error handling when selecting python for non Microsoft hosted agents
        // Install junitparser
        const pythonPath: string = tl.which('python3', true);
        const python3: trm.ToolRunner = tl.tool(pythonPath);
        python3.arg('-m');
        python3.arg('pip');
        python3.arg('install');
        python3.arg('--upgrade');
        python3.arg('junitparser');
        try {
            await python3.exec();
            tl.setResult(tl.TaskResult.Succeeded, 'Successfully installed junitparser.');

        } catch (err) {
            // There was an issue
            tl.setResult(tl.TaskResult.Failed, err.message);
        }

        // Generate the results
        const genResults: trm.ToolRunner = tl.tool(pythonPath);
        genResults.arg(path.join(__dirname, 'parsesastresults.py'));
        genResults.arg('--target');
        genResults.arg(`${appName}`);
        genResults.arg('--minseverity');
        genResults.arg(`${minSeverity}`);
        genResults.arg('--failbuild');
        genResults.arg(`${failBuild}`);
        const publishResults: number = await genResults.exec();
        tl.setResult(tl.TaskResult.Succeeded, 'Success');

        return;

    } catch (err) {

        tl.setResult(tl.TaskResult.Failed, err.message);

        return;
    }
}

/*
 * Prepare scanTarget by checking if a file was supplied
 * If a folder was supplied, zip it and name it scaninput.zip
 * @scanTarget: User supplied input
 */
async function prepareScanTarget(scanTarget: string): Promise<string> {
    try {

        if (tl.exist(scanTarget)) {
            // scanTarget exists
            // Check to see if the target is a file
            const file: boolean = await is_file(scanTarget);
            if (file) {
                // Since its a file, we won't zip it and assume its
                // a EAR/JAR/WAR or .zip file with code
                return scanTarget;

            } else {
                // Delete scaninput.zip if it exists
                if (tl.exist(path.join(tempPath, 'scaninput.zip'))) {
                    try {
                        fs.unlinkSync(path.join(tempPath, 'scaninput.zip'));
                        console.log('Found existing scaninput.zip, deleting.');
                    } catch (err) {
                        console.log(err);
                    }
                }

                const zipFile: string = path.join(tempPath, 'scaninput.zip');
                // Zip the supplied folder
                const zipPath: string = tl.which('zip', true);
                const zip: trm.ToolRunner = tl.tool(zipPath);
                zip.arg('-r');
                zip.arg(`${zipFile}`);
                zip.arg(`${scanTarget}`);
                const zipOutput: number = await zip.exec();

                return zipFile;
            }
        } else {
            // A bad file or directory was supplied
            throw new Error('Invalid scan target.');
        }

    } catch (err) {

        throw new Error(err);

    }
}

// Download the SAST pipeline scan tool
async function downloadVeracodeSast(): Promise<string> {

    try {
        const sastDownloadFile: string = 'pipeline-scan-LATEST.zip';
        const abosolutePath: string = path.join(tempPath, sastDownloadFile);
        const veracodeURL: string = 'https://downloads.veracode.com/securityscan/pipeline-scan-LATEST.zip';
        // Check to see if the file already exists, if not, download it
        if (!tl.exist(abosolutePath)) {

            return await tool.downloadTool(veracodeURL, abosolutePath);

        } else {
            // Delete it and redownload to make sure we always use the most recent version
            console.log('Veracode SAST file already in cache. Deleting and redownloading to ensure we use the latest version.');

            try {
                fs.unlinkSync(abosolutePath);

            } catch (err) {
                console.log(err);
            }

            return await tool.downloadTool(veracodeURL, abosolutePath);

        }

    } catch (err) {
        // There was an issue
        tl.setResult(tl.TaskResult.Failed, err.message);

        return err;
    }
}

// Extract the SAST pipeline scan tool
async function extractVeracodeSast(sastDownload: string): Promise<string> {

    // Need to delete pipeline-scan.jar if it already exists
    const currentJar: string | undefined = path.join(tempPath, 'pipeline-scan.jar');
    if (!tl.exist(currentJar)) {
        // Extract the pipeline-scan-LATEST.zip file
        const sastZip: string = await tool.extractZip(sastDownload, tempPath);

        return path.join(sastZip, 'pipeline-scan.jar');

    } else {
        console.log('pipeline-scan.jar already exists. Deleting and re-extracting from latest download.');
        const readMe: string = path.join(tempPath, 'README.md');

        try {
            fs.unlinkSync(currentJar);
            fs.unlinkSync(readMe);

        } catch (err) {
            console.log(err);
        }
        // Extract the pipeline-scan-LATEST.zip file if the jar isn't already there
        const sastZip: string = await tool.extractZip(sastDownload, tempPath);

        return path.join(sastZip, 'pipeline-scan.jar');

    }

}

// Check to see if the supplied object is a file
async function is_file(scanTarget: string): Promise<boolean> {
    try {
        const stats: fs.Stats = fs.statSync(scanTarget);

        return stats.isFile();
    } catch (err) {

        return false;
    }
}

// Run the scan
async function runScan(toolExtract: string,
                       scanTarget: string,
                       VERACODE_API_ID: string,
                       VERACODE_API_KEY: string,
                       baseLineFile: string): Promise<void> {

    try {
        // Run the scan
        const javaPath: string = tl.which('java', true);
        const java: trm.ToolRunner = tl.tool(javaPath);
        //java.arg('-Dpipeline.debug=true');
        java.arg('-jar');
        java.arg(`${toolExtract}`);
        java.arg('-f');
        java.arg(`${scanTarget}`);
        java.arg('--veracode_api_id');
        java.arg(`${VERACODE_API_ID}`);
        java.arg('--veracode_api_key');
        java.arg(`${VERACODE_API_KEY}`);
        // Check to make sure the supplied baseline file is a file instead of
        // the default folder of /home/vsts/work/1/s
        const baselineExists: boolean = await is_file(baseLineFile);
        if (baselineExists) {
            // A baselineFile was supplied (no proof it is valid)
            java.arg('-bf');
            java.arg(`${baseLineFile}`);
        }

        // Veracode returns a status code >=1, indicating the number of flaws found
        // We have to ignore the return code from java so we can continue the task
        // https://help.veracode.com/reader/tS9CaFwL4_lbIEWWomsJoA/jm5gzgo~F75rEgPVp_WcoQ
        const testExecOptions = <trm.IExecOptions>{ignoreReturnCode: true};
        const javaOutput: number = await java.exec(testExecOptions);
        if (javaOutput >= 1 && javaOutput <= 200) {
            tl.setResult(tl.TaskResult.Succeeded, `Scan successful, found ${javaOutput} flaws`);

            return;
        } else if (javaOutput === 0) {
            tl.setResult(tl.TaskResult.Succeeded, 'Scan successful, found no issues');

            return;
        } else {
            tl.setResult(tl.TaskResult.Failed, 'The scan failed because of network flaws, invalid Veracode API credentials, or other problems.');

            return;
        }

    } catch (err) {
        throw new Error(err);

    }

}

run();
