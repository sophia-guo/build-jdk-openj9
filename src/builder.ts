import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'

const workDir = process.env['GITHUB_WORKSPACE']
const IS_WINDOWS = process.platform === "win32"
const targetOs = IS_WINDOWS ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'

export async function buildJDK(
  version: string,
  usePersonalRepo: boolean
): Promise<void> {
  const openj9Version = `openj9-openjdk-jdk${version}`
  await installDependencies(version)
  process.chdir(`${workDir}`)
  await getBootJdk(version)
  process.chdir(`${workDir}`)
  await getSource(openj9Version, usePersonalRepo)
  await exec.exec(`make all`)
  await printJavaVersion(version, openj9Version)
}

async function installDependencies(version: string): Promise<void> {
  if (`${targetOs}` === 'mac') {
    await exec.exec('brew install autoconf ccache coreutils bash nasm gnu-tar')
    core.addPath('/usr/local/opt/gnu-tar/libexec/gnubin')
    core.info(`path is ${process.env['PATH']}`)
    exec.exec('tar --version')
  } else {
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
  }
  process.chdir(`${workDir}`)
  const freeMarker = await tc.downloadTool(`https://sourceforge.net/projects/freemarker/files/freemarker/2.3.8/freemarker-2.3.8.tar.gz/download`)
  await exec.exec(`sudo tar -xzf ${freeMarker} freemarker-2.3.8/lib/freemarker.jar --strip=2`)
  await io.rmRF(`${freeMarker}`)
}

async function getBootJdk(version: string): Promise<void> {
  const bootJDKVersion = (parseInt(version) - 1).toString()
  if (parseInt(bootJDKVersion) > 8) {
    let bootjdkJar
    // TODO: issue open openj9,mac, 10 ga : https://api.adoptopenjdk.net/v3/binary/latest/10/ga/mac/x64/jdk/openj9/normal/adoptopenjdk doesn't work
    if (`${bootJDKVersion}` === '10' && `${targetOs}` === 'mac') {
      bootjdkJar = await tc.downloadTool(`https://github.com/AdoptOpenJDK/openjdk10-binaries/releases/download/jdk-10.0.2%2B13.1/OpenJDK10U-jdk_x64_mac_hotspot_10.0.2_13.tar.gz`)
    } else {
      bootjdkJar = await tc.downloadTool(`https://api.adoptopenjdk.net/v3/binary/latest/${bootJDKVersion}/ga/${targetOs}/x64/jdk/openj9/normal/adoptopenjdk`)
    }
    await io.mkdirP('bootjdk')
    if (`${targetOs}` === 'mac') {
      await exec.exec(`sudo tar -xzf ${bootjdkJar} -C ./bootjdk --strip=3`)
    } else {
      await exec.exec(`sudo tar -xzf ${bootjdkJar} -C ./bootjdk --strip=1`)
    }
    await io.rmRF(`${bootjdkJar}`)
    core.exportVariable('JAVA_HOME', `${workDir}/bootjdk`)//# Set environment variable JAVA_HOME, and prepend ${JAVA_HOME}/bin to PATH
    core.addPath(`${workDir}/bootjdk/bin`)
  }
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

async function printJavaVersion(version: string, openj9Version: string): Promise<void> {
  let platform
  if (`${targetOs}` === 'linux') {
    platform = 'linux'
  } else if (`${targetOs}` === 'mac') {
    platform = 'macosx'
  } else {
    platform = 'windows'
  }
  let platformRelease = `${platform}-x86_64-normal-server-release`
  if (parseInt(version) >= 13) platformRelease = `${platform}-x86_64-server-release`
  let jdkImages
  if (version === '8') {
    jdkImages = `build/${platformRelease}/images/j2sdk-image`
    process.chdir(`${jdkImages}/jre/bin`)
  } else {
    jdkImages = `build/${platformRelease}/images/jdk`
    process.chdir(`${jdkImages}/bin`)
  }
  await exec.exec(`./java -version`)
  //set outputs
  core.setOutput('BuildJDKDir', `${workDir}/${openj9Version}/${jdkImages}`)
}