import * as exec from '@actions/exec'
import * as core from '@actions/core'
//import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'

export async function buildJDK(
  version: string,
  user: string,
  branch: string
): Promise<void> {
  await installDependencies()
  process.chdir(`${process.env.GITHUB_WORKSPACE}`)
  core.info(`current directory is ${process.cwd()}`)
  getSource(version, user, branch)
  await exec.exec(`configurebash ./configure --with-freemarker-jar=/root/freemarker.jar`)
  await exec.exec(`make all`)
  core.info('testing............')
  process.chdir(`openj9-openjdk-jdk8/build/linux-x86_64-normal-server-release/images/j2sdk-image/jre/bin`)
  await exec.exec(`./java -version`)
}

async function installDependencies(): Promise<void> {
  await exec.exec('sudo apt-get update')
  await exec.exec(
    'sudo apt-get install -qq -y --no-install-recommends \
    software-properties-common \
    python-software-properties'
  )
  await exec.exec('sudo add-apt-repository ppa:openjdk-r/ppa')
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
    openjdk-7-jdk \
    pkg-config \
    realpath \
    ssh \
    unzip \
    wget \
    zip'
  )
  await io.rmRF(`/var/lib/apt/lists/*`)

  process.chdir('/usr/local')
 // let gccBinary = await tc.downloadTool(`https://ci.adoptopenjdk.net/userContent/gcc/gcc730+ccache.x86_64.tar.xz`)
 // await tc.ex.extractTar(gccBinary)  can extractTar do the strip-components as wget?
 // && tar -xJf gcc-7.tar.xz --strip-components=1 \
 // && rm -rf gcc-7.tar.xz`)
  await exec.exec(`sudo wget -O gcc-7.tar.xz https://ci.adoptopenjdk.net/userContent/gcc/gcc730+ccache.x86_64.tar.xz`)
  await exec.exec(`tar -xJf gcc-7.tar.xz --strip-components=1`)
  await io.rmRF(`gcc-7.tar.xz`)

  await exec.exec(`sudo ln -s /usr/lib/x86_64-linux-gnu /usr/lib64 \
  && ln -s /usr/include/x86_64-linux-gnu/* /usr/local/include \
  && ln -s /usr/local/bin/g++-7.3 /usr/bin/g++ \
  && ln -s /usr/local/bin/gcc-7.3 /usr/bin/gcc`)
  
  process.chdir('/root')
  await exec.exec(`wget https://sourceforge.net/projects/freemarker/files/freemarker/2.3.8/freemarker-2.3.8.tar.gz/download -O freemarker.tgz`)
  await exec.exec(`tar -xzf freemarker.tgz freemarker-2.3.8/lib/freemarker.jar --strip=2`)
  await io.rmRF(`freemarker.tgz`)
}

async function getSource(
  version: string,
  user: string,
  branch: string
): Promise<void> {
  const openjdkDir = `openj9-openjdk-jdk${version}`
  await exec.exec(`git clone -b ${branch} https://github.com/${user}/${openjdkDir}`)
  process.chdir(`${openjdkDir}`)
  await exec.exec(`bash ./get_source.sh`)
}