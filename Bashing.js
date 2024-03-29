var keneanung = (function (keneanung) {
    "use strict";
    keneanung.bashing = (function () {

        var config = {
            enabled: true,
            warning: 1200,
            fleeing: 1000,
            autoflee: true,
            autoraze: false,
            razecommand: "none",
            attackcommand: "kill",
            prios: {}
        };

        var gmcpArea = "";
        var gmcpTargetId = "";
        var gmcpStatusTarget = "None";

        var damage = 0;
        var healing = 0;
        var lastHealth = 0;
        var maxHealth = 0;

        var targetList = [];

        var roomContent = [];

        var attacking = -1;

        var attacks = 0;

        var fleeDirection = "n";
        var lastRoom = "";

        var colorify = function (str) {
            var pattern = /##(\w+)##/;
            var first = true;
            var match;
            while (match = pattern.exec(str)) {
                var repl;
                if (first && match[1] == "reset") {
                    //skip a reset as the first tag...
                } else if (match[1] == "reset") {
                    repl = "</span>";
                    first = true;
                } else if (first) {
                    repl = '<span style="color: ' + match[1] + '">';
                    first = false;
                } else {
                    repl = '</span><span style="color: ' + match[1] + '">';
                }
                str = str.replace(pattern, repl);
            }
            if (!first) {
                str += "</span>";
            }
            return str;
        };

        var linkify = function (text, codeToRun, alt) {
            var a = $('<a ></a>');
            a.attr('href', "javascript:void(0);");
            a.text(text);
            a.attr('onclick', codeToRun + ";return false;");
            a.attr('title', alt);
            return a.prop("outerHTML");
        };

        var kecho = function (text) {
            var toEcho = "<p>##forestgreen##keneanung##reset##: " + text + "</p>";
            var colouredEcho = colorify(toEcho);
            ow_Write("#output_main", colouredEcho);
            console.log(text);
        };

        var idOnly = function (list) {
            var ids = [];
            for (var i = 0; i < list.length; i++) {
                ids.push(list[i].id);
            }
            return ids;
        };

        var save = function () {
            //var configString = JSON.stringify(config);
            set_variable("keneanung.bashing.config", config);
            //make sure the changes get uploaded to IRE...
            if (settings_window && settings_window.set_system_vals) {
                settings_window.set_system_vals();
                settings_window.system_changed = false;
                client.system_changed = false;
                client.gmcp_save_system();
            } else {
                kecho("##yellow##New settings will autosave in Nexus after 90 seconds.");
            }
        };

        var load = function () {
            var loadedConfig = get_variable("keneanung.bashing.config");
            for (var key in loadedConfig) {
                if (loadedConfig.hasOwnProperty(key))
                    config[key] = loadedConfig[key];
            }
        };

        var getPrio = function (item) {
            var prios = config.prios[gmcpArea] || [];
            for (var i = 0; i < prios.length; i++) {
                if (item == prios[i]) {
                    return i;
                }
            }
            return -1;
        };

        var addTarget = function (item) {
            var insertAt;

            var targetPrio = getPrio(item.name);

            if (targetPrio == -1) {
                return;
            }

            if (targetList.length == 0) {
                targetList[0] = {
                    id: item.id,
                    name: item.name
                }
            } else {
                //don't add stuff twice
                for (var i2 = 0; i2 < targetList.length; i2++) {
                    if (targetList[i2].id == item.id) {
                        return
                    }
                }

                var iStart = 0, iEnd = targetList.length - 1, iMid = 0;
                var found = false;

                while (iStart <= iEnd) {
                    iMid = Math.floor((iStart + iEnd) / 2);
                    var existingPrio = getPrio(targetList[iMid].name);

                    if (targetPrio == existingPrio) {
                        insertAt = iMid;
                        found = true;
                        break;
                    } else if (existingPrio == -1 || targetPrio < existingPrio) {
                        iEnd = iMid - 1;
                    } else {
                        iStart = iMid + 1;
                    }
                }

                if (!found) {
                    insertAt = iStart;
                }

                if (insertAt <= attacking && targetList.length >= attacking) {
                    insertAt = attacking + 1;
                }

                targetList.splice(insertAt, 0, {id: item.id, name: item.name});

            }
        };

        var removeTarget = function (item) {
            var number = -1;
            for (var i = 0; i < targetList.length; i++) {
                if (targetList[i].id == item.id) {
                    number = i;
                    break;
                }
            }

            if (number > -1) {
                targetList.splice(number, 1);
                if (number <= attacking) {
                    attacking--;
                    setTarget();
                }
            }
        };

        var difference = function (list1, list2) {
            if (list1.length != list2.length) {
                return true;
            }

            for (var i = 0; i < list1.length; i++) {
                if (list1[i] != list2[i]) {
                    return true;
                }
            }

            return false;
        };

        var displayTargetList = function () {
            kecho("Current target list:");
            for (var i = 0; i < targetList.length; i++) {
                ow_Write("#output_main",
                    "<span style='color: orange; white-space: pre-wrap'>     "
                    + targetList[i].name + "</span>");
            }
            console.log(targetList);
        };

        var emitEventsIfChanged = function (before, after) {
            console.log("event");
            if (difference(before, after)) {
                run_function("keneanungBashingTargetListChanged", after, "ALL");
                displayTargetList();
                if (before[0] != after[0]) {
                    run_function("keneanungBashingTargetListFirstChanged", after[0], "ALL");
                }
            }
        };

        var setTarget = function () {
            if (targetList.length == 0) {
                var targetSet = false;
                if(typeof gmcpStatusTarget != "undefined" && gmcpStatusTarget != "None"){
                    for(var i = 0; i < roomContent.length; i++){
                        var cont = roomContent[i];
                        if(typeof cont.attrib != "undefined" && cont.attrib.indexOf("m") > -1
                            && cont.name.toLowerCase().indexOf(gmcpStatusTarget.toLowerCase()) > -1){
                            targetList[targetList.length] = {
                                id: cont.id,
                                name: cont.name
                            };
                            targetSet = true;
                        }
                    }
                }
                if(!targetSet){
                    clearTarget();
                    stopAttack();
                }else{
                    attacking++;
                }
            } else {
                if (attacking == -1 || targetList[attacking].id != gmcpTargetId) {
                    attacking++;
                }
                send_GMCP("IRE.Target.Set", targetList[attacking].id + "");
            }
        };

        var clearTarget = function() {
            send_GMCP('IRE.Target.Set "0"');
            attacking = -1;
        };

        var startAttack = function () {
            if (attacking >= 0) {
                var trigger = reflex_find_by_name("trigger", "keneanung.bashing.queueTrigger", false, false, "Bashing");
                console.log(trigger);
                reflex_enable(trigger);
                send_direct("queue add eqbal keneanungki", false);
            }
        };

        var stopAttack = function () {
            var trigger = reflex_find_by_name("trigger", "keneanung.bashing.queueTrigger", false, false, "Bashing");
            reflex_disable(trigger);
            send_direct("cq all");
            attacking = -1;
        };

        var warnFlee = function () {
            kecho("Better run or get ready to die!");
        };

        var notifyFlee = function () {
            kecho("Running as you have not enough health left.");
        };

        var calcFleeValue = function(configValue){
            var isString = typeof(configValue) == "string";
            if(isString && /%$/.test(configValue))
            {
                return Number(/^(\d+)/.exec(configValue)[1]) * maxHealth / 100;
            }
            else if(isString && /d$/.test(configValue))
            {
                return Number(/^(.+?)d/.exec(configValue)[1]) * damage / attacks;
            }
            else
            {
                return Number(configValue);
            }
        };

        var module = {};

        module.roomInfoCallback = function (roomInfo) {
            gmcpArea = roomInfo.area;

            if(lastRoom == ""){
                lastRoom = roomInfo.num;
                fleeDirection = "n";
            }
            if(lastRoom == roomInfo.num){
                return;
            }

            damage  = 0;
            healing = 0;
            attacks = 0;

            if(attacking > -1){
                clearTarget();
                stopAttack();
            }

            var exits = roomInfo.exits;
            var found = false;

            for(var direction in exits){
                if(!exits.hasOwnProperty(direction)) continue;
                if(exits[direction] == lastRoom){
                    fleeDirection = direction;
                    found = true;
                    break;
                }
            }

            if(!found && typeof roomInfo.ohmap == "undefined"){
                kecho("##red##WARNING:##reset## No exit to flee found, reusing ##red##" + fleeDirection + "##reset##.")
            }

            lastRoom = roomInfo.num;
        };

        module.setGmcpTarget = function (target) {
            gmcpTargetId = target;
        };

        module.vitalsCallback = function (vitals) {
            var health = Number(vitals.hp);
            maxHealth = Number(vitals.maxhp);
            var difference = lastHealth - health;
            if (difference > 0) {
                damage += difference;
            } else {
                healing += Math.abs(difference);
            }

            lastHealth = health;
        };

        module.statusCallback = function (status){
            if(typeof status.target != "undefined"){
                gmcpStatusTarget = status.target;
            }
        };

        module.attackButton = function (){
            if (attacking == -1) {
                setTarget();
                startAttack();
                kecho("Nothing will stand in our way.\n");
            } else{
                clearTarget();
                stopAttack();
                kecho("Lets save them for later.\n");
            }
         };

        module.flee = function() {
            stopAttack();
            send_direct("queue prepend eqbal " + fleeDirection)
        };

        module.handleShield = function() {
            if(config.autoraze){
                send_direct("queue prepend eqbal keneanungra", false);
            }
        };

        module.attack = function(){
            attacks++;
            var avgDmg = damage / attacks;
            var avgHeal = healing / attacks;

            var estimatedDmg = avgDmg * 2 - avgHeal;

            var fleeat = calcFleeValue(config.fleeing);
            var warnat = calcFleeValue(config.warning);

            if(config.autoflee && estimatedDmg > lastHealth - fleeat){
                notifyFlee();
                module.flee();
                return;
            }else if(estimatedDmg > lastHealth - warnat){
                warnFlee();
            }
            send_direct("queue add eqbal keneanungki", false);
        };

        module.addPossibleTarget = function (targetName) {
            var prios = config.prios;

            if (!prios[gmcpArea]) {
                prios[gmcpArea] = [];
                kecho("Added '" + gmcpArea + "' as new area.");
            }

            if ($.inArray(targetName, prios[gmcpArea]) == -1) {
                var before = idOnly(targetList);

                prios[gmcpArea].push(targetName);
                kecho("Added the new possible target '" + targetName + "' to the end of "
                + "the priority list.");

                save();

                for (var i = 0; i < roomContent.length; i++) {
                    addTarget(roomContent[i]);
                }

                var after = idOnly(targetList);

                emitEventsIfChanged(before, after);
            }
        };

        module.ItemAddCallback = function (arg) {
            if (arg.location != "room" || !config.enabled) {
                return;
            }

            var before = idOnly(targetList);

            roomContent.push(arg.item);
            addTarget(arg.item);

            var after = idOnly(targetList);

            emitEventsIfChanged(before, after);
        };

        module.ItemRemoveCallback = function (arg) {
            if (arg.location != "room" || !config.enabled) {
                return;
            }

            var before = idOnly(targetList);
            var id = arg.item.id;
            for (var i = 0; i < roomContent.length; i++) {
                if (roomContent[i].id == id) {
                    roomContent.splice(i, 1);
                    break;
                }
            }
            removeTarget(arg.item);

            var after = idOnly(targetList);

            emitEventsIfChanged(before, after);
        };

        module.ItemListCallback = function (arg) {
            if (arg.location != "room" || !config.enabled) {
                return;
            }

            var backup = targetList;
            var before = idOnly(targetList);
            targetList = [];
            roomContent = [];

            var items = arg.items;

            for (var i = 0; i < items.length; i++) {
                roomContent[roomContent.length] = items[i];
                addTarget(items[i]);
            }

            var after = idOnly(targetList);

            if (before.length == after.length && $(before).not(after).length == 0) {
                targetList = backup;
                return
            }

            emitEventsIfChanged(before, after);
        };

        module.setFleeDirection = function(dir){
            fleeDirection = dir;
            kecho("Fleeing to the ##red##" + dir + "##reset##.")
        };

        module.showConfig = function () {
            var content = $("<div ></div>");
            var selectEnabled = $("<select ></select>", {
                name: "enabled",
                class: "bashingSelect ui-state-default ui-corner-all ui-widget",
                style: "padding-top: 0px; padding-bottom: 0px;"
            });
            
            $("<span></span>").text("Updates by ").appendTo(content);
            $("<img src='https://i.imgur.com/4umFJB2.png' style='max-width: 1.5em;vertical-align: middle;' />").appendTo(content);
            $("<span style='color: #a39d5b;'></span>").text("PYTHAGORAS").appendTo(content);
            $("<br /><br />").appendTo(content);
           
            
            
            var vals = ["on", "off"];
            var i, opt;
            for (i = 0; i < vals.length; i++) {
                opt = $("<option ></option>", {value: vals[i], text: vals[i]});
                if ((vals[i] == "on") == config.enabled) {
                    opt.attr("selected", "selected");
                }
                selectEnabled.append(opt);
            }
            $("<span ></span>").text("The basher is currently ").append(selectEnabled).appendTo(content);
            $("<br />").appendTo(content);

            var selectFlee = $("<select ></select>", {
                name: "autoflee",
                class: "bashingSelect ui-state-default ui-corner-all ui-widget",
                style: "padding-top: 0px; padding-bottom: 0px;"
            });
            for (i = 0; i < vals.length; i++) {
                opt = $("<option ></option>", {value: vals[i], text: vals[i]});
                if ((vals[i] == "on") == config.autoflee) {
                    opt.attr("selected", "selected");
                }
                selectFlee.append(opt);
            }
            $("<span ></span>").text("Autofleeing is currently ").append(selectFlee).appendTo(content);
            $("<br />").appendTo(content);

            $("<span ></span>").text("Issueing a warning at ").append($("<input />", {
                value: config.warning,
                name: "warning",
                class: "bashingInput ui-state-default ui-corner-all ui-widget"
            })).appendTo(content);
            $("<br />").appendTo(content);
            $("<span ></span>").text("Fleeing at ").append($("<input />", {
                value: config.fleeing,
                name: "fleeing",
                class: "bashingInput ui-state-default ui-corner-all ui-widget"
            })).appendTo(content);
            $("<br />").appendTo(content);

            var selectRaze = $("<select ></select>", {
                name: "autoraze",
                class: "bashingSelect ui-state-default ui-corner-all ui-widget",
                style: "padding-top: 0px; padding-bottom: 0px;"
            });
            for (i = 0; i < vals.length; i++) {
                opt = $("<option ></option>", {value: vals[i], text: vals[i]});
                if ((vals[i] == "on") == config.autoraze) {
                    opt.attr("selected", "selected");
                }
                selectRaze.append(opt);
            }
            $("<span ></span>").text("Autoraze is currently ").append(selectRaze).appendTo(content);
            $("<br />").appendTo(content);
            $("<span ></span>").text("Using this command for razing: ").append($("<input />", {
                value: config.razecommand,
                name: "razecommand",
                class: "bashingInput ui-state-default ui-corner-all ui-widget"
            })).appendTo(content);
            $("<br />").appendTo(content);
            $("<span ></span>").text("Using this command for attacking: ").append($("<input />", {
                value: config.attackcommand,
                name: "attackcommand",
                class: "bashingInput ui-state-default ui-corner-all ui-widget"
            })).appendTo(content);
            $("<br />").appendTo(content);
            $("<br />").appendTo(content);
            $("<button ></button>", {
                text: "save",
                class: "ui-state-default ui-corner-all",
                id: "keneanung-bashing-save"
            }).on("click", function () {
                var conf = {};
                var oldAttackCommand = config.attackcommand;
                var oldRazeCommand   = config.razecommand;
                $(".bashingInput").each(function (_, elem) {
                    conf[elem.name] = elem.value;
                });
                $(".bashingSelect").each(function (_, elem) {
                    conf[elem.name] = elem[elem.selectedIndex].value == "on";
                });
                for (var key in conf) {
                    if (!conf.hasOwnProperty(key)) continue;
                    config[key] = conf[key];
                }
                
                if(config.attackcommand != oldAttackCommand){
                    send_direct("setalias keneanungki " + config.attackcommand)
                }
                if(config.razecommand != oldRazeCommand){
                    send_direct("setalias keneanungra " + config.razecommand)
                }
                
                save();
                content.dialog("close");
            }).appendTo(content);

            content.dialog({
                close: function(){
                    content.empty();
                },
                title: "Bashing Settings"
            });
        };

        module.showPrios = function(){

            var body = $("<div ></div>");
            var select = $('<select id="keneanung-bashing-prio-areas" class="ui-widget ui-state-default ui-corner-all" style= "padding-top: 0; padding-bottom: 0;"></select>');
            var fillList = function () {
                var selectDOM = select[0];
                var area = selectDOM[selectDOM.selectedIndex].text;
                var targets = config.prios[area];
                var list = $("#keneanung-bashing-sort");
                list.empty();
                for (var i = 0; i < targets.length; i++) {
                    list.append("<li> " + targets[i] + "</li>");
                }
            };
            select.on("change", fillList);
            body.append(select);

            var updatePrios = function () {
                var newPrios = [];
                $("#keneanung-bashing-sort").children().each(function (index) {
                    newPrios[index] = $.trim($(this).text());
                });
                var selectDOM = select[0];
                var area = selectDOM[selectDOM.selectedIndex].text;
                config.prios[area] = newPrios;
            };

            for (var area in config.prios) {
                if (config.prios.hasOwnProperty(area)) {
                    select.append("<option>" + area + "</option>");
                }
            }

            var prioList = $('<fieldset class="ui-widget ui-state-default ui-corner-all">');
            prioList.append($("<legend>Priority list</legend>"));
            prioList.append($('<ul id="keneanung-bashing-sort" class="ui-widget ui-state-default ui-corner-all" style="list-style-type: none; padding:0; margin:0;"></ul>')
                .sortable({
                    stop: updatePrios,
                    connectWith: "#keneanung-bashing-trash"
                }).disableSelection()
            );
            body.append(prioList);

            var trash = $('<fieldset class="ui-widget ui-state-default ui-corner-all">');
            trash.append($("<legend>Trash</legend>"));
            trash.append($('<ul id="keneanung-bashing-trash" class="ui-widget ui-state-default ui-corner-all" style="list-style-type: none; padding:10px; margin:0;"></ul>')
                .sortable({
                    stop: updatePrios,
                    connectWith: "#keneanung-bashing-sort"
                }).disableSelection()
            );
            body.append(trash);

            var saveButton = $("<button ></button>", {
                text: "save",
                class: "ui-state-default ui-corner-all",
                id: "keneanung-bashing-prios-save"
            });
            saveButton.on("click", function () {
                save();
                body.dialog("close");
            });
            body.append(saveButton);

            body.dialog({
                close: function(){
                    body.empty();
                },
                title: "Bashing Priorities"
            });

            fillList();
        };

        load();
        send_direct("setalias keneanungki " + config.attackcommand);
        send_direct("setalias keneanungra " + config.razecommand);

        var buttonsDefined = false;

        for(var buttonIndex in buttons){
            if(buttons[buttonIndex] != null){
                if(buttons[buttonIndex].script == "keneanung.bashing.attackButton()"){
                    buttonsDefined = true;
                    break;
                }
            }
        }
        
        if(!buttonsDefined){
            buttons_count = buttons_count + 2;
            bottom_button_set(buttons_count - 1, "", "keneanung.bashing.attackButton()", "Bash", false);
            bottom_button_set(buttons_count, "", "keneanung.bashing.flee()", "Flee", false);
        }

        return module;

    }());
    return keneanung;
}(keneanung || {}));

print("Aeka bashing version loaded", "orange");
