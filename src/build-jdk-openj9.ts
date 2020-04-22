import * as core from '@actions/core'
import * as builder from './builder'

async function run(): Promise<void> {
  try {
    let version = core.getInput('version', {required: false})
    let user = core.getInput('user', {required: false})
    let branch = core.getInput('branch', {required: false})
    if (!version) version = '8' // same as branch
    if (!user) user = 'ibmruntimes' // same as branch
    if (!branch) branch = 'openj9' // if action with default, this should not be necessary
    await builder.buildJDK(version, user, branch)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
