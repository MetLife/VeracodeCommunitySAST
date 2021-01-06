# Veracode Community Static Analysis Security Testing (SAST) Azure DevOps Extension

This project is community contributed and is not supported by Veracode. For a list of supported projects, please visit Veracode.com.

## Overview

Seamlessly integrate Veracode SAST scans with Azure DevOps build pipelines. Please note, this SAST scan is not the same thing as the "Upload and Scan" method. The primary difference is that this scan does not record findings with the central Veracode platform. You can find an overview of each method on Veracode's website [here](https://help.veracode.com/reader/9nOkCbEfhLEzMgzr2zCv5Q/8ogXM1j_wRm_AYmyKdrdoQ).

## Requirements

To run this plug-in in your build pipeline, you must be an existing Veracode SAST customer. Additionally, you need a valid VERACODE_API_ID and VERACODE_API_KEY to use this plug-in. Documentation for how to create a token for Continuous Integration (CI) activities can be found on Veracode's website [here](https://help.veracode.com/r/t_create_api_creds).

Currently, this plug-in will only run on a Linux or Mac Azure Pipelines agent (either hosted or self-hosted). Additionally, the agent requires Python > 3.6.

## Usage

There are four required inputs: VERACODE_API_ID/VERACODE_API_KEY, Target to scan, Minimum severity to report, and an option to fail the build.

* VERACODE_API_ID/VERACODE_API_KEY - Secure environment variable with your Veracode API token
* Target to scan - Path to the package to scan (i.e., EAR/JAR/WAR, or zip containing .js, .ts, pythyon, etc). Alternatively, submit path to a directory which will get zipped and scanned
* Minimum severity to report - Dropdown (Default is Medium)
* Fail the build - Fail the build if any vulnerabilities are found (Default is no)

There are two optional inputs: Application Name, and Test Agent capabilities

* Application Name - Optional input used to better label test results
* Baseline file - Optional input to filter the flaws that exist in the specified baseline JSON file and show only the additional flaws in the current scan. Please note: it is best practice to store this file in source, that way you have a history of exceptions, if any.

### Classic Pipeline Example

![SAST Extension](/images/sast-extension.png)

### YAML Pipeline Example

Below is sample YAML to insert into your build or release pipeline.

``` steps:
  - task: gattjoe.VeracodeCommunitySAST.custom-build-release-task.VeracodeCommunitySAST@0
  displayName: 'Veracode Community SAST scan - javascript'
  inputs:
    appName: javascript-vulnerable-methods
    scanTarget: '$(Build.SourcesDirectory)'
    baselineFile: baseline.json
  env:
    VERACODE_API_ID: $(VERACODE_API_ID)
    VERACODE_API_KEY: $(VERACODE_API_KEY)
```

## Setting and Securing VERACODE_API_ID/VERACODE_API_KEY

A high-level overview of setting secret values in YAML pipelines is [here](https://docs.microsoft.com/en-us/azure/devops/pipelines/process/variables?view=azure-devops&tabs=yaml%2Cbatch#secret-variables). To set secret values in Classic pipelines, refer to the documentation [here](https://docs.microsoft.com/en-us/azure/devops/pipelines/process/variables?view=azure-devops&tabs=yaml%2Cbatch#secret-variables).

In either case, first create variables in your build pipeline called VERACODE_API_ID, store the token in the field, and click on the lock icon to protect the token. Repeat the process for VERACODE_API_KEY. Please note, once you protect the token, you can never retrieve the value again from Azure DevOps. Once you have created the VERACODE_API_ID/VERACODE_API_KEY variables, you have to populate it in the plug-in. Navigate to the "Environment Variables" section of the plug-in, create the variable for VERACODE_API_ID and, for value, input $(VERACODE_API_ID). Repeat the process for VERACODE_API_KEY.


## Results

Vulnerabilities (if any) are automatically published to the build pipeline. To view them, simply click on the "Tests" tab. For each vulnerability discovered, a "failed test" will appear in the results.

![SAST Results](/images/sast-results.png)


## Known Issues and Limitations of the Microsoft hosted Azure Pipeline agent

If you intend to test a private endpoint (i.e., internal source code repository), it is probable that the Microsoft hosted agents do not have access to your internal network. As a result, please use a self-hosted Azure Pipeline agent. For self-hosted agents, Python >= 3.6.x is required. Please Note: Windows is currently not supported for the Veracode Community SCA Azure DevOps Extension.

Please refer to the links below for your target platform:

* [Linux](https://docs.microsoft.com/en-us/azure/devops/pipelines/agents/v2-linux?view=azure-devops)
* [MacOS](https://docs.microsoft.com/en-us/azure/devops/pipelines/agents/v2-osx?view=azure-devops)

The location of the latest self-hosted agents is [here](https://github.com/microsoft/azure-pipelines-agent)

## References

[Here](https://www.paraesthesia.com/archive/2020/02/25/tips-for-custom-azure-devops-build-tasks/) are some useful tips for developing tasks for Azure DevOps.
