""" Veracode Community SAST json result parser """
import argparse
import json
import os
from typing import Dict, List

from junitparser import TestCase, TestSuite, JUnitXml, Failure

# Create the parser
arg_parser = argparse.ArgumentParser(prog="scaresultparser")

# Add the arguments
arg_parser.add_argument("--target", "-t", metavar="target", type=str,
                        required=True, help='The target tested')
arg_parser.add_argument("--minseverity", "-c", metavar="minseverity", type=str,
                        required=True, default="Medium",
                        help='Minimum severity to report on.')
arg_parser.add_argument("--failbuild", "-f", metavar="failbuild", type=str,
                        required=True, default="false", choices=["true", "false"],
                        help='Fail the build (default is false).')

severities = {"Very High": 5, "High": 4, "Medium": 3, "Low": 2, "Very Low": 1}


def parse_sast_json(data: Dict, min_severity: str) -> List[Dict]:
    """ Parse Veracode SAST output """

    results: List[Dict] = []

    if len(data["findings"]) > 0:
        for vuln in data["findings"]:
            # Check the minimum severity to report on
            if severities.get(min_severity) > vuln["severity"]:
                pass
            else:
                # Populate results
                result_dict = create_result_dict()
                result_dict["Title"] = vuln["title"]
                result_dict["Issue Type"] = vuln["issue_type"]
                result_dict["Severity"] = vuln["severity"]
                result_dict["CWE"] = vuln["cwe_id"]
                result_dict["Vulnerable File"] = vuln["files"]["source_file"]["file"]
                result_dict["Details"] = vuln["files"]["source_file"]
                results.append(result_dict)
                result_dict = None
    else:
        # No vulnerabilities to address
        results.append({"Results": "No vulnerabilities."})

    return results


def create_result_dict() -> Dict:
    """ Create the results dictionary """
    return {"Title": None, "Issue Type": None, "Severity": None,
            "CWE": None, "Vulnerable File": None, "Details": []}


def write_output(target: str, results: list) -> None:
    """ Write scan results in junitxml format """

    suite = TestSuite(f"{target}")

    for result in results:
        if result != {"Results": "No vulnerabilities."}:
            test_case = TestCase(result["Title"])
            test_case.name = (result["Vulnerable File"] + " - " + result["Issue Type"])
            test_case.result = [Failure(result)]

        else:
            test_case = TestCase("No vulnerabilities")
            test_case.result = result

        suite.add_testcase(test_case)

    xml = JUnitXml()
    xml.add_testsuite(suite)
    xml.write('test-output.xml')


def main() -> None:

    """ Main function """
    # Execute the parse_args() method
    args = arg_parser.parse_args()
    target = args.target
    min_cvss = args.minseverity
    fail_build = args.failbuild

    # Open the Veracode SAST JSON results
    with open('filtered_results.json', 'r') as sast_results:
        data = json.load(sast_results)
    # Parse results
    results = parse_sast_json(data, min_cvss)

    # Generate test-output.xml
    write_output(target, results)

    # Upload results
    os.rename('filtered_results.json', f'{target}-results.json')
    # https://docs.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops&tabs=bash#upload-upload-an-artifact
    results_path = os.path.normpath(os.path.abspath(os.path.expanduser(os.path.expandvars(f'{target}-results.json'))))
    print(
        f"##vso[artifact.upload containerfolder=VeracodeCommunitySAST;artifactname=VeracodeCommunitySAST;]{results_path}"
    )

    output = os.path.normpath(os.path.abspath(os.path.expanduser(os.path.expandvars("test-output.xml"))))

    # Borrowed from pytest-azurepipelines
    # https://github.com/tonybaloney/pytest-azurepipelines/blob/master/pytest_azurepipelines.py

    run_title = f"{target}"

    print(
        f"##vso[results.publish type=JUnit;runTitle={run_title};failTaskOnFailedTests={fail_build};]{output}"
    )

if __name__ == "__main__":

    main()
