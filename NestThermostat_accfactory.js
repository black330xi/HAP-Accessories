// HomeKit types required
var types = require("./types.js");
var exports = module.exports = {};
var nestInfo = require("./Nest_Info.js"); //nest connection parameters
var storage = require('node-persist'); //persistent storage for the nest auth token

var nestList = []; //empty, we'll fill this when we talk to nest
var nestAccessToken = "";

function hashFnv32a(str, asString, seed) {
    /*jshint bitwise:false */
    var i, l,
        hval = (seed === undefined) ? 0x811c9dc5 : seed;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    if( asString ){
        // Convert to 8 digit hex string
        return ("0000000" + (hval >>> 0).toString(16)).substr(-8);
    }
    return hval >>> 0;
}

function genMAC(id){
    var hash = hashFnv32a(id, true);
    return "00:01:"+hash.split( /(?=(?:..)*$)/ ).join(":");
}

var getNestAccessToken = function() {
	var httpSync = require('http-sync');

  var request = httpSync.request({
    method: 'POST',
    headers: {},
    body: '',

    protocol: 'https',
    host: "api.home.nest.com",
    port: 443, //443 if protocol = https
    path: "/oauth2/access_token?code="+nestInfo.nestPIN+"&client_id="+nestInfo.nestClientID+"&client_secret="+nestInfo.nestClientSecret+"&grant_type=authorization_code"
  });

  var timedout = false;
  request.setTimeout(10000, function() {
    console.log("Request Timedout!");
    timedout = true;
  });
  var response = request.end();

  if (!timedout) {
    //console.log(response);
    //console.log(response.body.toString());

    var obj = JSON.parse(response.body);
    nestAccessToken = obj.access_token;
    //console.log("Token: "+nestAccessToken);
    storage.initSync();
    storage.setItem("nestAccessToken", obj.access_token);
  }	
};

var getNestThermostats = function() {
  console.log("Asking Nest for Thermostats...");
  var httpSync = require('http-sync');

  var request = httpSync.request({
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    body: '',
    protocol: 'https',
    host: "developer-api.nest.com",
    port: 443, //443 if protocol = https
    path: "/devices?auth="+storage.getItem("nestAccessToken")
  });

  var timedout = false;
  request.setTimeout(10000, function() {
    console.log("Request Timedout!");
    timedout = true;
  });
  var response = request.end();

  if (!timedout) {
    //console.log(response);
    //console.log(response.body.toString());

    var obj = JSON.parse(response.body);
    var thermostats = obj.thermostats;
    for (var k in thermostats){
      if (typeof thermostats[k] !== 'function') {
        var thermostat = thermostats[k];
        nestList.push({
          id: k,
          name: thermostat.name_long,
          temperature_scale: thermostat.temperature_scale,
          hvac_mode: thermostat.hvac_mode,
          current_temperature: thermostat["ambient_temperature_"+thermostat.temperature_scale.toLowerCase()]*1.0,
          target_temperature: thermostat["target_temperature_"+thermostat.temperature_scale.toLowerCase()]*1.0,
        });
      }
    }
  }
};


var execute = function(accessory,id,characteristic,value) {
  var httpSync = require('http-sync');
  var body = "";
  if(characteristic === "target_temperature") {
    characteristic += "_c";
    body = value*1.0;
  }
  
  var post_data = JSON.stringify(body); 

  var request = httpSync.request({
    method: 'put',
    headers: {
      accept: 'application/json'
    },
    body: post_data,
    protocol: 'https',
    host: "developer-api.nest.com",
    port: 443, //443 if protocol = https
    path: "/devices/thermostats/"+id+"/"+characteristic+"?auth="+storage.getItem("nestAccessToken")
  });

  var timedout = false;
  request.setTimeout(10000, function() {
    console.log("Request Timedout!");
    timedout = true;
  });
  var response = request.end();

  if (!timedout) {
    console.log("Nest response: " + response.body.toString());
    //console.log(response.body.toString());
    console.log("executed accessory: " + accessory + ", and characteristic: " + characteristic + ", with value: " +  value + ".");
  }
};

var getValue = function(id,characteristic) {
  var body = "";
  
  var httpSync = require('http-sync');

  var request = httpSync.request({
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    body: '',
    protocol: 'https',
    host: "developer-api.nest.com",
    port: 443, //443 if protocol = https
    path: "/devices/thermostats/"+id+"?auth="+storage.getItem("nestAccessToken")
  });

  var timedout = false;
  request.setTimeout(10000, function() {
    console.log("Request Timedout!");
    timedout = true;
  });
  var response = request.end();

  if (!timedout) {
    //console.log(response);
    //console.log(response.body.toString());

    var obj = JSON.parse(response.body);
    var thermostat = obj;
    //console.log(thermostat.ambient_temperature_c);
    //console.log(typeof thermostat.ambient_temperature_c);
    
    return thermostat.ambient_temperature_c;
  }
};

var newTemplateAccessory = function () {
  return {
    displayName: "Thermostat",
    username: "CA:3E:BC:4D:5E:FF",
    pincode: "031-45-154",
    services: [{
      sType: types.ACCESSORY_INFORMATION_STYPE, 
      characteristics: [{
        cType: types.NAME_CTYPE, 
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of thermostat",
        designedMaxLength: 255    
      },{
        cType: types.MANUFACTURER_CTYPE, 
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Nest",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255    
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "T200577",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Model",
        designedMaxLength: 255    
      },{
        cType: types.SERIAL_NUMBER_CTYPE, 
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Serial",
        designedMaxLength: 255    
      },{
        cType: types.IDENTIFY_CTYPE, 
        onUpdate: null,
        perms: ["pw"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Identify Accessory",
        designedMaxLength: 1    
      }]
    },{
      sType: types.THERMOSTAT_STYPE, 
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Thermostat Control",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Bla",
        designedMaxLength: 255   
      },{
        cType: types.CURRENTHEATINGCOOLING_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.id, "current_mode", value); },
        perms: ["pr","ev"],
        format: "int",
        initialValue: 2,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Current Mode",
        designedMaxLength: 1,
        designedMinValue: 0,
        designedMaxValue: 2,
        designedMinStep: 1,    
      },{
        cType: types.TARGETHEATINGCOOLING_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.id, "target_mode", value); },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: 3,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Target Mode",
        designedMinValue: 0,
        designedMaxValue: 3,
        designedMinStep: 1,
      },{
        cType: types.CURRENT_TEMPERATURE_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.id, "current_temperature", value); },
        getValue: function() { console.log("GetValue"); return getValue(this.locals.id, "current_temperature"); },
        perms: ["pr","ev"],
        format: "int",
        initialValue: 20,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Current Temperature",
        unit: "celsius"
      },{
        cType: types.TARGET_TEMPERATURE_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.id, "target_temperature", value); },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: 20,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Target Temperature",
        designedMinValue: 16,
        designedMaxValue: 38,
        designedMinStep: 0.5,
        unit: "celsius"
      },{
        cType: types.TEMPERATURE_UNITS_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.locals.name, this.locals.id, "unit", value); },
        perms: ["pr","ev"],
        format: "int",
        initialValue: 1,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Unit",
      }]
    }]
  };
};

//the factory creates new accessory objects with the parameters that are passed
var nestAccFactory = function (paramsObject) {

    if (typeof paramsObject === 'undefined') {
        console.log("nestAccFactory requires an paramsObject!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
    if (typeof paramsObject.id !== 'string') {
        console.log("nestAccFactory requires an paramsObject.groupAdress as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
    if (typeof paramsObject.name !== 'string') {
        console.log("nestAccFactory requires an paramsObject.groupAdress as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
    if (typeof paramsObject.temperature_scale !== 'string') {
        console.log("nestAccFactory requires an paramsObject.fullname as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {{id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
    if (typeof paramsObject.hvac_mode !== 'string') {
        console.log("nestAccFactory requires an paramsObject.fullname as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {{id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
    if (typeof paramsObject.current_temperature !== 'number') {
        console.log("nestAccFactory requires an paramsObject.fullname as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {{id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
    if (typeof paramsObject.target_temperature !== 'number') {
        console.log("nestAccFactory requires an paramsObject.fullname as a string!");
        throw {name: "ENOPARAMS", message: "required parameter missing, provide {{id, name, temperature_scale, hvac_mode, current_temperature, target_temperature}."};
    }
 
    var newAccessory = newTemplateAccessory();
  
    newAccessory.displayName = paramsObject.name;
    newAccessory.username = genMAC(paramsObject.id);
    newAccessory.serialNumber = paramsObject.id;
    newAccessory.locals = {
      name: paramsObject.name,
      id: paramsObject.id
    };
    newAccessory.services[0].characteristics[0].initialValue = paramsObject.name; // NAME_CTYPE
    newAccessory.services[0].characteristics[3].initialValue = genMAC(paramsObject.id); // SERIAL_NUMBER_CTYPE

    //console.log(newAccessory);
    return newAccessory;
};

module.exports = (function() {
  var accessories = [];
  var index;

  //start persistent storage
  storage.initSync();

  //get nest token first
  if (typeof storage.getItem("nestAccessToken") === "undefined") {
    getNestAccessToken();
  } else {
    nestAccessToken = storage.getItem("nestAccessToken");
  }

  getNestThermostats();

  for (index in nestList) {
    if (nestList.hasOwnProperty(index)) {
      accessories.push({accessory: nestAccFactory(nestList[index])});
    }
  }
  return accessories;
}());