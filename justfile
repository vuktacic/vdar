# project_root := justfile_directory()

default:
    just --list

build:
    cd vcore && pio run

clean:
    cd vcore && pio run --target clean -v
    cd vvis && rm -rf .cache .tmp lib build

fullclean:
    cd vcore && pio run --target fullclean -v
    cd vvis && rm -rf .cache .tmp lib build node_modules

flash:
    cd vcore && pio run --target upload

monitor:
    cd vcore && pio device monitor

setup:
    cd vcore && pio pkg install
    cd vvis && npm install

run:
    cd vvis && npm start
