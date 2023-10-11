
(function($) {
    'use strict';    


    // -------------------------------------------------------------------------
    // Configuration
    var networkType = getNetworkTypeFromHash(4);
    var threeToOneSwitchCurrent = 15;
    var properPhaseHandling = false;
    var rootMaxCurrent = 80;
    var childMaxCurrent = 63;
    var numCircuits = 3;
    var numChargersPerCircuit = 6;
    // -------------------------------------------------------------------------


    var dataKeys = {
        charger: 'charger'
    };

    var circuits = [];

    for(var i=0; i<numCircuits; i++) {
        var circuitId = i+1;
        var circuit = {
            Name: 'circuit ' + circuitId,
            AvailableCurrentPhase1: childMaxCurrent,
            AvailableCurrentPhase2: childMaxCurrent,
            AvailableCurrentPhase3: childMaxCurrent,
            NetworkType: networkType,
            Children: []
        };
        circuits.push(circuit);

        for(var j=0; j<numChargersPerCircuit; j++) {
            var chargerId = j+1;
            var chargerElementId = circuitId + '-' + chargerId;
            var chargerElementId = `00000000-${circuitId}${circuitId}${circuitId}${circuitId}-${chargerId}${chargerId}${chargerId}${chargerId}-0000-000000000000`;
            circuit.Children.push({ Id: chargerElementId, DeviceId: 'charger ' + circuitId + '.' + chargerId });
        }
    }

    var circuit = {
        Name: 'root',
        AvailableCurrentPhase1: rootMaxCurrent,
        AvailableCurrentPhase2: rootMaxCurrent,
        AvailableCurrentPhase3: rootMaxCurrent,
        NetworkType: networkType,
        Children: circuits
    };

    setDefaults(circuit, true);
    function setDefaults(circuit, resetMode) {
        if(circuit.Children) {
            circuit.Children.forEach(function(child) {
                if(child.DeviceId) {
                    child.HasThreeToOnePhaseSwitch = true;
                    child.MaxCurrent = 32;
                    child.MinCurrent = 6;
                    child.MaxPhases = parseInt(networkType)===4?3:1;
                    child.AllocatedCurrent = null;
                    child.AllocatedPhases = null;
                    if (child.Mode === 2){
                        child.Mode = 3;
                    }
                    if(resetMode) {
                        child.Mode = 1;
                    }
                }
                else {
                    setDefaults(child, resetMode);
                }
            });
        }
    }

    function getNetworkTypeFromHash(defaultType) {
        var networkType = 4;
        if(window.location.hash) {
            try {
                networkType = window.location.hash.substr(1);
            } catch (err) { }
        }
        return networkType || defaultType;
    }

    function render() {
        console.log('### rendering');
        var el = $('#incharge-demo');
        el.empty();

        el.append(createControls());        
        
        const mainBody = $('<div class="main-body"></div>')        
        mainBody.append(createHeader());

        
        var circuitEl = createCircuitEl(circuit);
        if(circuitEl) {
            mainBody.append(circuitEl);
            circuitEl.find('button').on('click', toggle);
        }
        el.append(mainBody);
    }

    function walkChargers(node, fn) {
        if(node.Children) {
            node.Children.forEach(function(child) {
                if(child.DeviceId) {
                    fn(child);
                }
                else {
                    walkChargers(child, fn);
                }
            });
        }
    }

    function walkCircuits(node, fn) {
        if(node.NetworkType) {
            fn(node);

            if(node.Children) {
                node.Children.forEach(function(child) {
                    if(child.Children) {
                        walkCircuits(child, fn);
                    }
                });
            }
        }
    }

    function toggle(event) {
        var charger = $(event.target).parents('.charger').data(dataKeys.charger);
        const chargerEl = $(event.target).parents('.charger');

        switch(charger.Mode) {
            case 2:
            case 3:
                charger.Mode = 1;
                charger.SessionStartTime = null;
                break;
            default:
                charger.Mode = 3;
                chargerEl.addClass('queued');
                if(!charger.SessionStartTime) {
                    charger.SessionStartTime = new Date().toISOString();
                }
                break;
        }

        walkChargers(circuit, function(charger) {
            if(!properPhaseHandling) {
                charger.AllocatedCurrent = 0;
                charger.AllocatedPhases = 0;
            }
            if(charger.Mode === 2) {
                charger.Mode = 3;
            }
        });

        balance();
    }

    function balance() {
        $.post({
            url: 'https://api.zaptec.com/api/tools/balance?threeToOneSwitchCurrent=' + threeToOneSwitchCurrent,
            contentType: 'application/json',
            data: JSON.stringify(circuit),
            success: function success(result) {
                circuit = result;
                render();
            },
            error: function error(error) {
                if(error.responseJSON) {
                    if(error.responseJSON.Code === 509) {
                        alert('Too many requests! Please wait a few seconds and try again...');
                        return;
                    }
                }
                console.error(error);
            }
        });
    }

    function nodeEl(node, currents) {
        if(node.DeviceId) {
            return createChargerEl(node);
        }
        else {
            return createCircuitEl(node, currents);
        }
    }

    function createCircuitEl(circuit, parentCurrents) {        
        var el = $('<ul class="circuit"><h2>' + circuit.Name + '</h2></ul>');        

        var currents = [0,0,0];

        if(circuit.Children) {
            var listEl = $('<ul class="chargers"></ul>');
            if (!parentCurrents){
                listEl.addClass('root-chargers')
            }
            circuit.Children.forEach(function(node) {
                listEl.append(nodeEl(node, currents));
                if(node.DeviceId) {
                    addToCurrents(currents, node);
                    addToCurrents(parentCurrents, node);
                }
            });
            el.append(listEl);
        }

        el.find('h2:first').after(createCurrentsEl(circuit.AvailableCurrentPhase1, networkType, currents, parentCurrents, circuit.Name));

        return el;
    }

    function roundCurrent(current) {
        return Math.floor(current*10)/10;
    }

    function addToCurrents(currents, charger) {
        if(charger.Mode === 3) {
            switch(charger.AllocatedPhases) {
                case 1:
                    currents[0] += charger.AllocatedCurrent;
                    break;
                case 2:
                    currents[1] += charger.AllocatedCurrent;
                    break;
                case 4:
                    currents[2] += charger.AllocatedCurrent;
                    break;
                case 7:
                    currents[0] += charger.AllocatedCurrent;
                    currents[1] += charger.AllocatedCurrent;
                    currents[2] += charger.AllocatedCurrent;
                    break;
            }
        }
    }

    function humanReadablePhase(phaseId) {
        var phases = [];
        if((phaseId&1)>0) phases.push(1);
        if((phaseId&2)>0) phases.push(2);
        if((phaseId&4)>0) phases.push(3);
        return 'ø' + phases.join('/');
    }

    function createHeader() {
        const el = $('<div class="header"><div class="header-title"><h1>Dynamic phase balancing:</h1><h2>Try Zaptec'+"'"+'s <span>patented</span> technology</h2></div><div class="legend"></div></div>');
        const legend = el.find('.legend');
        const idleLegend = $('<div class="legend-item idle"><span class="circle"></span><span>No EV connected</span></div>');
        const chargingLegend = $('<div class="legend-item charging"><span class="circle"></span><span>EV connected and charging</span></div>');
        const waitingLegend = $('<div class="legend-item waiting"><span class="circle"></span><span>EV connected, waiting for available power</span></div>');
        legend.append(idleLegend);
        legend.append(chargingLegend);
        legend.append(waitingLegend);
        
        return el;
    }

    function createControls() {
        var el = $('<div class="controls"><label>Electical grid <select><option value="1">IT 1 phase</option><option value="2">IT 3 phase</option><option value="3">TN 1 phase</option><option value="4">TN 3 phase</option></select></label><button class="reset" type="button">Reset</button> <div class="logo"/></div>');
        el.find('option[value=' + networkType + ']').attr('selected', 'selected');
        el.find('select').change(function() {
            var value = $(this).val();
            if(value != networkType) {
                networkType = value;
                walkCircuits(circuit, function(circuit) {
                    circuit.NetworkType = networkType;
                    window.location.hash = networkType;
                });
                setDefaults(circuit, false);
                balance();
            }
        });
        el.find('button.reset').on('click', function() {
            walkChargers(circuit, function(charger) {
                charger.AllocatedCurrent = 0;
                charger.AllocatedPhases = 0;
                charger.Mode = 1;
                charger.HasThreeToOnePhaseSwitch = true;

            });
            balance();
        });
        return el;
    }

    function createChargerEl(charger) {
        var el = $('<li class="charger" id="charger-' + charger.Id + '"><button type="button" class="charger-item">' + charger.DeviceId + '</button></li>');
        el.data(dataKeys.charger, charger);

        switch(charger.Mode) {
            case 2:
                el.addClass('queued');
                break;
            case 3:
                el.addClass('charging');
                var kwh = (charger.AllocatedCurrent*230/1000*(charger.AllocatedPhases===7?3:1));
                kwh = Math.floor(kwh * 100)/100;
                el.append('<div class="charge-power">' + kwh + 'kW</div><div class="charge-current">' + humanReadablePhase(charger.AllocatedPhases) + ' ' + roundCurrent(charger.AllocatedCurrent) + 'A</div>');
                break;
        }

        return el;
    }

    function round(value) {
        return Math.round(value*100)/100;
    }

    function asKwh(currents) {
        var current = 0;
        for(var i=0; i<currents.length; i++) {
            current += currents[i];
        }
        return current*230/1000;
    }

    function createCurrentsEl(maxCurrent, networkType, currents, parentCurrents, circuitName) {
        const isParentCurrent = !parentCurrents;
        const fullCircuitName = circuitName === 'root' ? 'Main fuse' : 'Charge ' + circuitName;
        var el = $('<div class="current-bar-container"><div class="current-name">'+fullCircuitName+'</div><div class="charge-current"></div><div class="current-bars"><div class="phase1"><div class="bar"></div></div><div class="phase2"><div class="bar"></div></div><div class="phase3"><div class="bar"></div></div></div><div class="charge-power"></div></div>');
        if (isParentCurrent) {
            el.addClass('main-current')
        }        
        el.find('.charge-current').append(maxCurrent + 'A');
        el.find('.charge-power').append(round(asKwh(currents)) + 'kW');
       if(networkType==2) {
            var l1_l3 = currents[0];
            var l2_l3 = currents[1];
            var l2_l1 = currents[2];

            // translate phase currents into real conductor currents
            var l1 = Math.sqrt(Math.pow(l1_l3 - (l2_l1*Math.cos(2*Math.PI/3)),2) + Math.pow(l2_l1*Math.sin(2*Math.PI/3),2));
            var l2 = Math.sqrt(Math.pow(l2_l3 - (l2_l1*Math.cos(2*Math.PI/3)),2) + Math.pow(l2_l1*Math.sin(2*Math.PI/3),2));
            var l3 = Math.sqrt(Math.pow(l1_l3 - (l2_l3*Math.cos(2*Math.PI/3)),2) + Math.pow(l2_l3*Math.sin(2*Math.PI/3),2));

            el.find('.phase1 .bar').css({top: 100-(100/maxCurrent*l1) + '%'});
            el.find('.phase2 .bar').css({top: 100-(100/maxCurrent*l2) + '%'});
            el.find('.phase3 .bar').css({top: 100-(100/maxCurrent*l3) + '%'});
        }
        else {

        el.find('.phase1 .bar').css({top: 100-(100/maxCurrent*currents[0]) + '%'});
        el.find('.phase2 .bar').css({top: 100-(100/maxCurrent*currents[1]) + '%'});
        el.find('.phase3 .bar').css({top: 100-(100/maxCurrent*currents[2]) + '%'});
        }
        return el;
    }

    $(document).ready(function() {
        render();
    });
})(jQuery);
