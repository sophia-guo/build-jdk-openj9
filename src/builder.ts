import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'

const workDir = process.env['GITHUB_WORKSPACE']
export async function buildJDK(
  version: string,
  usePersonalRepo: boolean
): Promise<void> {
  const openj9Version = `openj9-openjdk-jdk${version}`
  await installDependencies(version)
  process.chdir(`${workDir}`)
  await getSource(openj9Version, usePersonalRepo)
  await exec.exec(`make all`)
  let platform = 'linux-x86_64-normal-server-release'
  if (version === '14') platform = 'linux-x86_64-server-release' // TODO: this looks like a error in the README of Eclipse Openj9
  let jdkImages
  if (version === '8') {
    jdkImages = `build/${platform}/images/j2sdk-image`
    process.chdir(`${jdkImages}/jre/bin`)
  } else {
    jdkImages = `build/${platform}/images/jdk`
    process.chdir(`${jdkImages}/bin`)
  }
  await exec.exec(`./java -version`)
  core.setOutput('BuildOpenJ9JDK', `${workDir}/${openj9Version}/${jdkImages}`)
}

async function installDependencies(version: string): Promise<void> {
  await exec.exec('sudo apt-get update')
  await exec.exec(
    'sudo apt-get install -qq -y --no-install-recommends \
    software-properties-common \
    python-software-properties'
  )
//Note gcc-multilib is needed on github environment
  await exec.exec(`sudo apt-get update`)
  await exec.exec(
    'sudo apt-get install -qq -y --no-install-recommends \
    autoconf \
    ca-certificates \
    ccache \
    cmake \
    cpio \
    file \
    git \
    git-core \
    libasound2-dev \
    libcups2-dev \
    libdwarf-dev \
    libelf-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libnuma-dev \
    libx11-dev \
    libxext-dev \
    libxrender-dev \
    libxt-dev \
    libxtst-dev \
    make \
    nasm \
    pkg-config \
    realpath \
    ssh \
    unzip \
    wget \
    gcc-multilib \
    zip'
  )
  await io.rmRF(`/var/lib/apt/lists/*`)

  if (version === '8') {
    await exec.exec('sudo add-apt-repository ppa:openjdk-r/ppa')
    await exec.exec(`sudo apt-get update`)
    await exec.exec(
      'sudo apt-get install -qq -y --no-install-recommends openjdk-7-jdk'
    )
    await io.rmRF(`/var/lib/apt/lists/*`)
  } else {
    await exec.exec(`sudo apt-get update`)
    await exec.exec(
      'sudo apt-get install -qq -y --no-install-recommends libxrandr-dev'
    )
    await io.rmRF(`/var/lib/apt/lists/*`)
    const bootjdkVersion = (parseInt(version) - 1).toString()
    const bootjdkJar = await tc.downloadTool(`https://api.adoptopenjdk.net/v3/binary/latest/${bootjdkVersion}/ga/linux/x64/jdk/openj9/normal/adoptopenjdk`)
    await io.mkdirP('bootjdk')
    await exec.exec('ls')
    await exec.exec(`sudo tar -xzf ${bootjdkJar} -C ./bootjdk --strip=1`)
    await io.rmRF(`${bootjdkJar}`)
    core.exportVariable('JAVA_HOME', `${workDir}/bootjdk`)//# Set environment variable JAVA_HOME, and prepend ${JAVA_HOME}/bin to PATH
    core.addPath(`${workDir}/bootjdk/bin`)
  }

  process.chdir('/usr/local')
  const gccBinary = await tc.downloadTool(`https://ci.adoptopenjdk.net/userContent/gcc/gcc730+ccache.x86_64.tar.xz`)
  await exec.exec(`ls -l ${gccBinary}`)
  await exec.exec(`sudo tar -xJ --strip-components=1 -C /usr/local -f ${gccBinary}`)
  await io.rmRF(`${gccBinary}`)

  await exec.exec(`sudo ln -s /usr/lib/x86_64-linux-gnu /usr/lib64`)
  await exec.exec(`sudo ln -s /usr/include/x86_64-linux-gnu/* /usr/local/include`)
  await exec.exec(`sudo ln -sf /usr/local/bin/g++-7.3 /usr/bin/g++`)
  await exec.exec(`sudo ln -sf /usr/local/bin/gcc-7.3 /usr/bin/gcc`)
  process.chdir(`${workDir}`)
  const freeMarker = await tc.downloadTool(`https://sourceforge.net/projects/freemarker/files/freemarker/2.3.8/freemarker-2.3.8.tar.gz/download`)
  await exec.exec(`sudo tar -xzf ${freeMarker} freemarker-2.3.8/lib/freemarker.jar --strip=2`)
  await io.rmRF(`${freeMarker}`)
}

async function getSource(
  openj9Version: string,
  usePersonalRepo: boolean
): Promise<void> {
  let openjdkOpenj9Repo = `ibmruntimes/${openj9Version}`
  let openjdkOpenj9Branch = 'openj9'
  let omrRepo = ''
  let omrBranch = ''
  let openj9Repo = ''
  let openj9Branch = ''
  if (usePersonalRepo) {
    const repo = process.env.GITHUB_REPOSITORY as string
    const ref = process.env.GITHUB_REF as string
    const branch = ref.substr(ref.lastIndexOf('/') + 1)
    if (repo.includes(`/${openj9Version}`)) {
      openjdkOpenj9Repo = repo
      openjdkOpenj9Branch = branch
    } else if (repo.includes('/openj9-omr')) {
      omrRepo = repo
      omrBranch = branch
    } else if (repo.includes('/openj9')) {
      openj9Repo = repo
      openj9Branch = branch
    } else {
      core.error(`${repo} is not one of openj9-openjdk-jdk8|11|12..., openj9, omr`)
    }
  }

  await exec.exec(`git clone -b ${openjdkOpenj9Branch} https://github.com/${openjdkOpenj9Repo}.git`)
  process.chdir(`${openj9Version}`)
  let omrParameters = ''
  let openj9Parameters = ''
  if (omrRepo.length !== 0) {
    omrParameters = `-omr-repo=https://github.com/${omrRepo}.git -omr-branch=${omrBranch}`
  }
  if (openj9Repo.length !== 0) {
    openj9Parameters = `-openj9-repo=https://github.com/${openj9Repo}.git -openj9-branch=${openj9Branch}`
  }
  await exec.exec(`bash ./get_source.sh ${omrParameters} ${openj9Parameters}`)
  await exec.exec(`bash configure --with-freemarker-jar=${workDir}/freemarker.jar`)
}