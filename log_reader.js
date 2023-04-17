// Copyright (c) 2020, Jeroen van der Gun
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of
//    conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of
//    conditions and the following disclaimer in the documentation and/or other materials
//    provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
// THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
// OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
// TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

class LogReader {
  constructor(data) {
    this.data = data;
    this.pos = 0;
  }

  end() {
    return this.pos >> 3 >= this.data.length;
  }

  readBool() {
    const end = this.end();
    const byte = end ? 0 : this.data.charCodeAt(this.pos >> 3);
    const bit = 7 - (this.pos & 7);
    const result = byte >> bit & 1;
    this.pos++;
    return result;
  }

  readFixed(bits) {
    let result = 0;
    while (bits--) {
      result = result << 1 | this.readBool();
    }
    return result;
  }

  readTally() {
    let result = 0;
    while (this.readBool()) {
      result++;
    }
    return result;
  }

  readFooter() {
    let size = this.readFixed(2) << 3;
    const free = (8 - (this.pos & 7)) & 7;
    size |= free;
    let minimum = 0;
    while (free < size) {
      minimum += 1 << free;
      free += 8;
    }
    return this.readFixed(size) + minimum;
  }
}

class PlayerLogReader extends LogReader {
  constructor(data, team, duration) {
    super(data);
    let time = 0;
    let flag = PlayerLogReader.noFlag;
    let powers = PlayerLogReader.noPower;
    let prevent = false;
    let button = false;
    let block = false;
    while (!this.end()) {
      let newTeam = this.readBool() ? (team ? (this.readBool() ? PlayerLogReader.noTeam : 3 - team) : 1 + this.readBool()) : team; // quit : switch : join : stay
      let dropPop = this.readBool();
      let returns = this.readTally();
      let tags = this.readTally();
      let grab = !flag && this.readBool();
      let captures = this.readTally();
      let keep = !dropPop && newTeam && (newTeam == team || !team) && (!captures || (!flag && !grab) || this.readBool());
      let newFlag = grab ? (keep ? 1 + this.readFixed(2) : PlayerLogReader.temporaryFlag) : flag;
      let powerups = this.readTally();
      let powersDown = PlayerLogReader.noPower;
      let powersUp = PlayerLogReader.noPower;
      for (let i = 1; i < 16; i <<= 1) {
        if (powers & i) {
          if (this.readBool()) powersDown |= i;
        } else if (powerups && this.readBool()) {
          powersUp |= i;
          powerups--;
        }
      }
      let togglePrevent = this.readBool();
      let toggleButton = this.readBool();
      let toggleBlock = this.readBool();
      time += 1 + this.readFooter();
      if (!team && newTeam) {
        team = newTeam;
        this.joinEvent(time, team);
      }
      for (let i = 0; i < returns; i++) {
        this.returnEvent(time, flag, powers, team);
      }
      for (let i = 0; i < tags; i++) {
        this.tagEvent(time, flag, powers, team);
      }
      if (grab) {
        flag = newFlag;
        this.grabEvent(time, flag, powers, team);
      }
      if (captures--) {
        do {
          if (keep || !flag) {
            this.flaglessCaptureEvent(time, flag, powers, team);
          } else {
            this.captureEvent(time, flag, powers, team);
            flag = PlayerLogReader.noFlag;
            keep = true;
          }
        } while (captures--);
      }
      for (let i = 1; i < 16; i <<= 1) {
        if (powersDown & i) {
          powers ^= i;
          this.powerdownEvent(time, flag, i, powers, team);
        } else if (powersUp & i) {
          powers |= i;
          this.powerupEvent(time, flag, i, powers, team);
        }
      }
      if (togglePrevent) {
        if (prevent) {
          this.stopPreventEvent(time, flag, powers, team);
        } else {
          this.startPreventEvent(time, flag, powers, team);
        }
        prevent = !prevent;
      }
      if (toggleButton) {
        if (button) {
          this.stopButtonEvent(time, flag, powers, team);
          button = false;
        } else {
          this.startButtonEvent(time, flag, powers, team);
          button = true;
        }
      }

      if (toggleBlock) {
        if (block) {
          this.stopBlockEvent(time, flag, powers, team);
          block = false;
        } else {
          this.startBlockEvent(time, flag, powers, team);
          block = true;
        }
      }

      if (dropPop) {
        if (flag) {
          this.dropEvent(time, flag, powers, team);
          flag = noFlag;
        } else {
          this.popEvent(time, powers, team);
        }
      }

      if (newTeam !== team) {
        if (!newTeam) {
          this.quitEvent(time, flag, powers, team);
          powers = noPower;
        } else {
          this.switchEvent(time, flag, powers, newTeam);
        }
        flag = noFlag;
        team = newTeam;
        }
      }
    this.endEvent(duration, flag, powers, team);
  }
}

class MapLogReader extends LogReader {
  heightEvent(newY) {}
  tileEvent(newX, y, tile) {}

  constructor(data, width) {
    super(data);
    let x = 0;
    let y = 0;
    while (!this.end() || x) {
      let tile = this.readFixed(6);
      if (tile) {
        if (tile < 6) tile += 9; // 1- 5 -> 10- 14
        else if (tile < 13) tile = (tile - 4) * 10; // 6-12 -> 20- 80
        else if (tile < 17) tile += 77; // 13-16 -> 90- 93
        else if (tile < 20) tile = (tile - 7) * 10; // 17-19 -> 100-120
        else if (tile < 22) tile += 110; // 20-21 -> 130-131
        else if (tile < 32) tile = (tile - 8) * 10; // 22-31 -> 140-230
        else if (tile < 34) tile += 208; // 32-33 -> 240-241
        else if (tile < 36) tile += 216; // 34-35 -> 250-251
        else tile = (tile - 10) * 10; // 36-63 -> 260-530
      }
      for (let i = 1 + this.readFooter(); i; i--) {
        if (!x) this.heightEvent(y);
        this.tileEvent(x, y, tile);
        if (++x == width) {
          x = 0;
          y++;
        }
      }
    }
  }
}

MapLogReader.emptyTile = 0;
MapLogReader.squareWallTile = 10;
MapLogReader.lowerLeftDiagonalWallTile = 11;
MapLogReader.upperLeftDiagonalWallTile = 12;
MapLogReader.upperRightDiagonalWallTile = 13;
MapLogReader.lowerRightDiagonalWallTile = 14;
MapLogReader.neutralFloorTile = 20;
MapLogReader.redFlagTile = 30;
MapLogReader.blueFlagTile = 40;
MapLogReader.neutralSpeedpadTile = 50;
MapLogReader.powerupTile = 60;
MapLogReader.jukeJuicePowerupTile = 61;
MapLogReader.rollingBombPowerupTile = 62;
MapLogReader.tagProPowerupTile = 63;
MapLogReader.topSpeedPowerupTile = 64;
MapLogReader.spikeTile = 70;
MapLogReader.buttonTile = 80;
MapLogReader.openGateTile = 90;
MapLogReader.closedGateTile = 91;
MapLogReader.redGateTile = 92;
MapLogReader.blueGateTile = 93;
MapLogReader.bombTile = 100;
MapLogReader.redFloorTile = 110;
MapLogReader.blueFloorTile = 120;
MapLogReader.entryPortalTile = 130;
MapLogReader.exitPortalTile = 131;
MapLogReader.redSpeedpadTile = 140;
MapLogReader.blueSpeedpadTile = 150;
MapLogReader.neutralFlagTile = 160;
MapLogReader.temporaryFlagTile = 161; // just a dummy, cannot occur on maps
MapLogReader.redEndzoneTile = 170;
MapLogReader.blueEndzoneTile = 180;

class SplatLogReader extends LogReader {
  splatsEvent(splats, timeIndex) {}
  
  static bits(size) {
    size *= 40;
    let grid = size - 1;
    let result = 32;
    if (!(grid & 0xFFFF0000)) { result -= 16; grid <<= 16; }
    if (!(grid & 0xFF000000)) { result -=  8; grid <<=  8; }
    if (!(grid & 0xF0000000)) { result -=  4; grid <<=  4; }
    if (!(grid & 0xC0000000)) { result -=  2; grid <<=  2; }
    if (!(grid & 0x80000000)) result--;
    return [result, ((1 << result) - size >> 1) + 20];
  }
  
  constructor(data, width, height) {
    super(data);
    let x = SplatLogReader.bits(width);
    let y = SplatLogReader.bits(height);
    for (let time = 0; !this.end(); time++) {
      let i = this.readTally();
      if (i) {
        let splats = [];
        while (i--) {
          splats.push([this.readFixed(x[0]) - x[1], this.readFixed(y[0]) - y[1]]);
        }
        this.splatsEvent(splats, time);
      }
    }
  }
}












