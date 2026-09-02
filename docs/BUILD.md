\# Building telEgo OpenWRT Packages from Source



Prerequisites on Build Machine:

\- Go 1.22+ installed

\- Python 3 with pip

\- nFPM package tool

\- Git



Step 1: Install Dependencies

\-----------------------------

pip install nfpm



Step 2: Clone Repositories

\---------------------------

git clone https://github.com/Scratch-net/telego.git telego-source

git clone https://github.com/YOUR\_REPO/telego-openwrt.git



Step 3: Build telEgo Binary

\----------------------------

cd telego-source

CGO\_ENABLED=0 go build -trimpath -ldflags="-s -w" -o ../telego-openwrt/telego-pkg/files/bin/telego ./cmd/telego



Step 4: Build APK Packages

\---------------------------

cd ../telego-openwrt/telego-pkg

nfpm pkg --target ../../packages/telego\_1.0.0\_x86\_64.apk --packager apk



cd ../luci-app-telego  

nfpm pkg --target ../../packages/luci-app-telego\_1.0.0\_noarch.apk --packager apk



Step 5: Install on Router

\--------------------------

scp packages/\*.apk root@ROUTER\_IP:/tmp/

ssh root@ROUTER\_IP "apk add --allow-untrusted /tmp/\*.apk"



For detailed installation instructions, see INSTALL.md



