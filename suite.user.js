/*!
// ==UserScript==
// @name         backpack.tf enhancement suite
// @namespace    http://steamcommunity.com/id/caresx/
// @author       cares
// @version      1.0.0
// @description  Enhances your backpack.tf experience.
// @match        *://backpack.tf/*
// @require      https://code.jquery.com/jquery-2.1.3.min.js
// @require      https://maxcdn.bootstrapcdn.com/bootstrap/3.3.4/js/bootstrap.min.js
// @require      https://cdn.rawgit.com/caresx/steam-econcc/2551ce827114e8fd11e94feaa9681bf4aa302379/econcc.js
// @require      https://cdn.rawgit.com/visionmedia/page.js/1102353025a984f7c88f38538bd62ff89e1eeee6/page.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.10.2/moment.min.js
// @downloadURL  https://caresx.github.io/backpacktf-enhancement-suite/suite.user.js
// @updateURL    https://caresx.github.io/backpacktf-enhancement-suite/suite.meta.js
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==
*/

(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Prefs = require('./preferences'),
    Page = require('./page');

Page.init();
require('./api').init();

Prefs
    .default('reptf', 'enabled', true)
    .default('quicklist', 'enabled', false)
    .default('pricetags', 'earbuds', true)
    .default('pricetags', 'modmult', 0.5)
    .default('pricetags', 'tooltips', true)
    .default('changes', 'enabled', true)
    .default('changes', 'period', (1000 * 60 * 60 * 24)) // 1 day
    .default('pricing', 'step', EconCC.Disabled)
    .default('pricing', 'range', EconCC.Range.Mid)
    .default('lotto', 'show', true)
    .default('notifications', 'updatecount', 'click')
    .default('classifieds', 'signature', '')
    .default('classifieds', 'autoclose', true)
;

function exec(mod) {
    mod();
    mod.initialized = true;
}

if (Prefs.enabled('reptf')) exec(require('./components/reptf'));
exec(require('./components/quicklist')); // prefs checked inside main
exec(require('./components/pricetags'));
if (Prefs.enabled('changes')) exec(require('./components/changes'));
exec(require('./components/refresh'));
exec(require('./components/classifieds'));
exec(require('./components/prefs'));
exec(require('./components/search'));
exec(require('./components/improvements'));
exec(require('./components/users'));

require('./menu-actions').applyActions();
Page.addTooltips();

Page.loaded = true;

},{"./api":2,"./components/changes":4,"./components/classifieds":5,"./components/improvements":6,"./components/prefs":7,"./components/pricetags":8,"./components/quicklist":9,"./components/refresh":10,"./components/reptf":11,"./components/search":12,"./components/users":13,"./menu-actions":14,"./page":15,"./preferences":16}],2:[function(require,module,exports){
var Page = require('./page'),
    Cache = require('./cache');

var callbacks = [];
var queue = [], task = false;
var key = localStorage.getItem("backpackapikey");
var apicache = new Cache("bes-cache-api");

function keyFromPage(body) {
    var elem = (body.match(/<pre>[a-f\d]{24}<\/pre>/)[0]) || "",
        apikey = elem.substr(5, elem.length - 11);

    return apikey;
}

function removeKey() {
    key = null;
    localStorage.removeItem("backpackapikey");
}

function registerKey() {
    var token = Page.csrfToken();

    if (!token) return; // :(
    $.ajax({
        method: 'POST',
        url: "/api/register_do",
        data: {url: "backpack.tf", comments: "backpack.tf Enhancement Suite", "user-id": token},
        success: function (body) {
            setKey(keyFromPage(body));
        }
    });
}

function setKey(apikey) {
    if (!apikey) return;

    key = apikey;
    localStorage.setItem("backpackapikey", apikey);
    callbacks.forEach(function (callback) {
        callback();
    });
}

function loadKey() {
    $.ajax({
        method: 'GET',
        url: "/api/register",
        success: function (body) {
            var apikey = keyFromPage(body);

            if (!apikey) {
                return registerKey();
            }

            setKey(apikey);
        },
        cache: false,
        dataType: "text"
    });
}

function requestInterface() {
    queue.push(arguments);
    if (!task) processInterface();
}

function processInterface() {
    var next = queue.shift();

    if (next) callInterface.apply(null, next);
}

function callInterface(meta, callback, args) {
    var iname = meta.name[0] !== 'I' ? 'I' + meta.name : meta.name,
        version = (typeof meta.version === 'string' ? meta.version : 'v' + meta.version),
        url = "/api/" + iname + "/" + version + "/",
        data = {key: meta.key !== false ? key : null, appid: meta.appid || 440, compress: 1},
        val, signature, wait, i;

    task = true;
    args = args || {};

    for (i in args) {
        data[i] = args[i];
    }

    if (meta.cache) {
        signature = url + "--" + JSON.stringify(data);
        val = apicache.get(signature);

        if (val.value) {
            if (val.value.success) {
                callback(val.value);
                task = false;
                processInterface();
                return;
            } else {
                apicache.rm(signature).save();
            }
        }
    }

    $.ajax({
        method: 'GET',
        url: url,
        data: data,
        cache: false,
        success: function (json) {
            var success = json.response.success;

            if (!success) {
                console.error('API error :: ' + iname + ': ' + JSON.stringify(json));
                if (json.message === "API key does not exist.") {
                    removeKey();
                    whenAvailable(function () {
                        callInterface(meta, callback, args);
                    });
                    loadKey();
                } else if (/^You can only request this page every/.test(json.message)) {
                    wait = json.message.match(/\d/g)[1] * 1000;
                    setTimeout(function () {
                        whenAvailable(function () {
                            callInterface(meta, callback, args);
                        });
                    }, wait + 100 + Math.round(Math.random() * 1000)); // to be safe, protection against race conditions
                } else { // Unknown error, maybe network disconnected
                    setTimeout(function () {
                        callInterface(meta, callback, args);
                    }, 1000);
                }
                return;
            }

            if (meta.cache) {
                apicache
                    .timeout(meta.cache || 1000 * 60)
                    .set(signature, json.response)
                    .save()
                ;
            }

            callback(json.response);
            task = false;
            processInterface();
        },
        dataType: "json"
    });
}

function isAvailable() { return !!key; }
function whenAvailable(callback) {
    if (exports.isAvailable()) callback();
    else callbacks.push(callback);
}

exports.init = function () {
    if (!key) {
        loadKey();
    }
};

exports.interface = exports.I = exports.call = requestInterface;

exports.whenAvailable = whenAvailable;

exports.APIKey = function () { return key; };
exports.isAvailable = isAvailable;

exports.IGetPrices = function (callback, args) {
    return requestInterface({
        name: "IGetPrices",
        version: 4,
        cache: 1000 * 60 * 30 // 30m
    }, callback, args);
};

exports.IGetCurrencies = function (callback, args) {
    return requestInterface({
        name: "IGetCurrencies",
        version: 1,
        cache: 1000 * 60 * 60 * 24 // 24h
    }, callback, args);
};

exports.IGetSpecialItems = function (callback, args) {
    return requestInterface({
        name: "IGetSpecialItems",
        version: 1,
        cache: 1000 * 60 * 60 * 24 // 24h
    }, callback, args);
};

exports.IGetUsers = function (ids, callback, args) {
    args = args || {};

    args.ids = Array.isArray(ids) ? ids.join(",") : ids;
    return requestInterface({
        name: "IGetUsers",
        version: 2
    }, callback, args);
};

exports.IGetUserListings = function (steamid, callback, args) {
    args = args || {};

    args.steamid = steamid;
    return requestInterface({
        name: "IGetUserListings",
        version: 1
    }, callback, args);
};

},{"./cache":3,"./page":15}],3:[function(require,module,exports){
var names = [];

function Cache(name, pruneTime) {
    this.name = name;
    this.storage = JSON.parse(localStorage.getItem(name) || "{}");
    this.pruneTime = pruneTime || 1000;

    names.push(name);
}

Cache.prototype.get = function (name) {
    var updated = this.prune();

    if (this.storage[name]) {
        if (updated) this.save();
        return {value: this.storage[name].json};
    }

    return {update: true};
};

Cache.prototype.set = function (name, json) {
    this.storage[name] = {time: Date.now() + this.pruneTime, json: json};
    return this;
};

Cache.prototype.rm = function (name) {
    delete this.storage[name];
    return this;
};

Cache.prototype.save = function () {
    localStorage.setItem(this.name, JSON.stringify(this.storage));
    return this;
};

Cache.prototype.timeout = function (t) {
    this.pruneTime = t;
    return this;
};

Cache.prototype.prune = function () {
    var updated = false,
        time, uid;

    for (uid in this.storage) {
        time = this.storage[uid].time;

        if (Date.now() > time) {
            updated = true;
            delete this.storage[uid];
        }
    }

    return updated;
};

module.exports = Cache;
module.exports.names = names;

},{}],4:[function(require,module,exports){
var Prefs = require('../preferences'),
    Page = require('../page'),
    Pricing = require('../pricing'),
    MenuActions = require('../menu-actions');

var period = Prefs.pref('changes', 'period'), // ms
    now = moment(),
    changes = [],
    ec;

function priceInPeriod(price) {
    var mom = moment.unix(price.last_update);
    return now.diff(mom) <= period;
}

function applyArrows() {
    // TODO: cleverness regarding DI
    changes.forEach(function (change) {
        var elem = change[0],
            price = change[1],
            stack = elem.find('.icon-stack'),
            value = {low: Math.abs(price.difference), currency: 'metal'},
            mode = EconCC.Mode.Label,
            diff, icon;

        if (!stack.length) {
            elem.append('<div class="icon-stack"></div>');
            stack = elem.find('.icon-stack');
        }

        if (price.difference === 0) {
            icon = "fa fa-yellow fa-retweet";
            diff = 'Refreshed';
        } else if (price.difference > 0) {
            icon = "fa fa-green fa-arrow-up";
            diff = 'Up ' + ec.format(value, mode);
        } else if (price.difference < 0) {
            icon = "fa fa-red fa-arrow-down";
            diff = 'Down ' + ec.format(value, mode);
        }

        diff += ' ' + moment.unix(price.last_update).from(now);

        stack.append("<div class='price-arrow'><i class='" + icon + "' title='" + diff + "' data-suite-tooltip></i></div>");
    });
}

function onMenuActionClick() {
    var dis = {},
        hours = period / 1000 / 60 / 60,
        ts = [],
        container = $("<div>"),
        d, clones, elems;

    elems = $('.price-arrow').parent().parent().filter(function () {
        var di = $(this).attr('data-defindex');
        if (!dis.hasOwnProperty(di)) {
            return (dis[di] = true);
        }
        return false;
    }).clone().addClass('change-clone').removeClass('unselected');

    if (hours >= 24) {
        d = Math.floor(hours / 24);
        ts.push((d === 1 ? "" : d + " ") + "day" + (d === 1 ? "" : "s"));
        hours %= 24;
    }
    if (hours) {
        ts.push((hours === 1 ? "" : hours + " ") + "hour" + (hours === 1 ? "" : "s"));
    }

    container
        .append("<p><i>Showing price changes from the past " + ts.join(" and ") + "</i></p>")
        .append($("<div id='change-cloned' class='row'/>").append(elems));

    unsafeWindow.modal("Recent Price Changes", container.html()); // Firefox support, .html()

    clones = $('.change-clone'); // FF support
    Page.addItemPopovers(clones, $("#change-cloned"));
    Page.addTooltips(clones.find('[data-suite-tooltip]'), '#change-cloned');
}

function addMenuAction() {
    MenuActions.addAction({
        name: 'Recent Price Changes',
        icon: 'fa-calendar',
        id: 'bp-recent-changes',
        click: onMenuActionClick
    });
}

function findChanges(pricelist) {
    $('.item:not(.spacer)').each(function () {
        var $this = $(this),
            item = pricelist.items[$this.data('name')],
            price, series;

        if (!item) return;
        price = item.prices[+($this.data('quality'))];
        if (!price) return;
        price = price[$this.data('tradable') ? "Tradable" : "Non-Tradable"];
        if (!price) return;
        price = price[$this.data('craftable') ? "Craftable" : "Non-Craftable"];
        if (!price) return;

        if (price[0]) {
            price = price[0];
            if (priceInPeriod(price)) {
                changes.push([$this, price]);
            }
        } else {
            if ((series = $this.data('crate')) || (series = $this.data('priceindex'))) {
                price = price[series];
                if (price && priceInPeriod(price)) {
                    changes.push([$this, price]);
                }
            }
        }
    });
}

function load() {
    if (Page.appid() !== 440) return; // Sorry Dota
    if (!Page.isBackpack()) return;

    Pricing.ec(function (inst, pricelist) {
        ec = inst;
        findChanges(pricelist);
        applyArrows();
        addMenuAction();
    });
}

module.exports = load;

},{"../menu-actions":14,"../page":15,"../preferences":16,"../pricing":17}],5:[function(require,module,exports){
var Page = require('../page'),
    Script = require('../script'),
    Prefs = require('../preferences'),
    Pricetags = require('./pricetags');

function peek(e) {
    var item = $('.item'),
        name, url;

    e.preventDefault();
    name = item.data('name');
    if (item.data('australium')) {
        name = name.substring(11);
    }
    url = '/classifieds/?item=' + name + '&quality=' + item.data('quality') + '&tradable=' + item.data('tradable') + '&craftable=' + item.data('craftable');
    if (item.data('australium')) {
        url += '&australium=1';
    }
    if (item.data('crate')) {
        url += '&numeric=crate&comparison=eq&value=' + item.data('crate');
    }

    $.ajax({
        method: "GET",
        url: url,
        success: function (html) {
            $("#peak-panel").append('<div class="panel-body padded"><div id="classifieds-sellers"></div></div>');
            var $sellers = $("#classifieds-sellers"),
                h = $.parseHTML(html),
                items = [],
                clones;

            $('.item', h).each(function () {
                var clone = this.cloneNode(true);
                clone.classList.add('classifieds-clone');

                items.push(clone);
            });

            $sellers.html(items);

            clones = $('.classifieds-clone');
            Page.addItemPopovers(clones, $sellers);

            if (Pricetags.enabled()) {
                Pricetags.setupInst(function () {
                    Pricetags.applyTagsToItems(clones);
                });
            }
        },
        dataType: "html"
    });
}

function add() {
    var htm =
        '<div class="row"><div class="col-12 "><div class="panel" id="peak-panel">'+
        '<div class="panel-heading">Classifieds <span class="pull-right"><small><a href="#" id="classifieds-peek">Peek</a></small></span></div>'+
        '</div></div></div></div>';
    var signature = Prefs.pref('classifieds', 'signature');

    $('#page-content .row:eq(1)').before(htm);
    $("#classifieds-peek").one('click', peek);
    $("#details").val(signature);
    Script.exec('$("#details").trigger("blur");');
}

function checkAutoclose() {
    if (Prefs.pref('classifieds', 'autoclose') &&
        /Your listing was posted successfully/.test($('.alert-success').text())) {
        window.close();
    }
}


function load() {
    page('/classifieds/add/:id', add);
    page('/classifieds/', checkAutoclose);
}

module.exports = load;

},{"../page":15,"../preferences":16,"../script":18,"./pricetags":8}],6:[function(require,module,exports){
var Prefs = require('../preferences'),
    MenuActions = require('../menu-actions'),
    Script = require('../script');

function addRemoveAllListings() {
    MenuActions.addAction({
        name: 'Remove Listings',
        icon: 'fa-trash-o',
        id: 'rm-classifieds-listings',
        click: function () {
            Script.exec("$('.listing-remove').click().click();"); // Double .click for confirmation
            (function refresh() {
                setTimeout(function () {
                    if (!$('.listing-remove').length) location.reload();
                    else refresh();
                }, 300);
            }());
        }
    });
}

function global() {
    var account = $('#profile-dropdown-container a[href="/my/account"]'),
        help = $('.dropdown a[href="/help"]'),
        moreCache = {}, moreLoading = {};

    if (account.length) account.parent().after('<li><a href="/my/preferences"><i class="fa fa-fw fa-cog"></i> My Preferences</a></li>');
    if (help.length) help.parent().before('<li><a href="/lotto"><i class="fa fa-fw fa-money"></i> Lotto</a></li>');
    if ($('.listing-remove').length) addRemoveAllListings();

    $('.text-more').mouseover(function() {
        var $this = $(this),
            url = $this.closest('.vote').find('.vote-stats li:eq(1) a').attr('href');

        function showPopover(html) {
            $this.popover({content: html, html: true}).popover('show');
        }

        if (moreCache[url]) return showPopover(moreCache[url]);
        if (moreLoading[url]) return;

        moreLoading[url] = true;
        $.get(url).done(function (page) {
            var html = $($.parseHTML(page)).find('.op .body').html();
            moreCache[url] = html;

            showPopover(html);
        }).always(function () {
            moreLoading[url] = false;
        });
    }).mouseout(function () { $(this).popover('hide'); });
}

function index() {
    function updateNotifications() {
        if (!notifsu) {
            $.get("/notifications");
            notifsu = true;
        }
    }

    var lotto = Prefs.pref('lotto', 'show'),
        updatec = Prefs.pref('notifications', 'updatecount'),
        notifs = $('.notification-list'),
        notifsu = false,
        newnotif;

    if (!lotto) {
        Script.exec("updateLotto = $.noop;");
        $('.lotto-box').remove();
    }

    if (notifs.length && updatec !== 'no') {
        newnotif = notifs.find(".notification.new");

        if ((updatec === 'load' && newnotif.length) ||
            (updatec === 'listing' && newnotif.find('.subject a:contains([removed listing])').length)) {
            newnotif.removeClass('.new');
            $("#notifications_new").remove();

            updateNotifications();
        } else if (updatec === 'click') {
            notifs.find(".notification").click(updateNotifications);
        }
    }
}

function load() {
    global();
    page('/', index);
    page.start({click: false, popstate: false});
}

module.exports = load;

},{"../menu-actions":14,"../preferences":16,"../script":18}],7:[function(require,module,exports){
var Prefs = require('../preferences'),
    Page = require('../page'),
    Quicklist = require('./quicklist'),
    Cache = require('../cache');

function addTab() {
    $("#settings-tabs").append('<li><a href="#bes">Enhancement Suite</a></li>');
    $('#settings-tabs [href="#bes"]').click(function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
}

function addTabContent() {
    function section(name, fields) {
        return [
            '<section>',
            '<h4>' + name + '</h4>',
            fields.join(""),
            '</section>'
        ].join("");
    }

    function buttons(name, component, key, bts) {
        return [
            '<div class="form-group">',
            '<label>' + name + '</label>',
            '<div class="btn-group" data-toggle="buttons" data-component="' + component + '" data-key="' + key + '">',
            bts,
            '</div>',
            '</div>'
        ].join("");
    }

    function button(text, id, fields) {
        return [
            '<div class="form-group">',
            '<a class="btn btn-primary"' + (id ? ' id="' + id + '"' : '') + '>' + text + '</a>',
            fields || "",
            '</div>'
        ].join("");
    }

    function userInput(label, component, key, value, placeholder) {
        return [
            '<div class="form-group">',
            '<label>' + label + '</label>',
            '<input type="text" class="form-control active" value="' + Page.escapeHtml(value || "") + '" placeholder="' + Page.escapeHtml(placeholder || "") + '" data-component="' + component + '" data-key="' + key + '">',
            '</div>',
        ].join("");
    }

    function yesno(yes, labels) {
        labels = labels || ["Yes", "No"];

        return [
            '<label class="btn btn-primary' + (yes ? ' active' : '') + '"><input type="radio" value="true"' + (yes ? ' checked' : '') + '>' + labels[0] + '</label>',
            '<label class="btn btn-primary' + (yes ? '' : ' active') + '"><input type="radio" value="false"' + (yes ? '' : ' checked') + '>' + labels[1] + '</label>'
        ].join("");
    }

    function choice(choices, active) {
        var html = "";

        choices.forEach(function (choice) {
            html += '<label class="btn btn-primary' + (choice.value === active ? ' active' : '') + '"><input type="radio" value="' + choice.value + '"' + (choice.value === active ? ' checked' : '') + '>' + choice.label + '</label>';
        });

        return html;
    }

    function help(text) {
        return '<span class="help-block">' + text + '</span>';
    }

    var html = [
        '<div class="tab-pane" id="bes">',

        '<h3>backpack.tf Enhancement Suite <span class="text-muted">v' + Page.SUITE_VERSION + '</span></h3>',
        '<div class="padded">',

        buttons('Show lotto', 'lotto', 'show', yesno(Prefs.pref('lotto', 'show'))),
        help("Shows or hides the lotto on the main page. It can still be viewed at <a href='/lotto'>backpack.tf/lotto</a>."),

        buttons('Notifications widget', 'notifications', 'updatecount', choice([
            {value: 'no', label: 'No'},
            {value: 'click', label: 'Notification click'},
            {value: 'listing', label: 'Removed listing'},
            {value: 'load', label: 'Always'},
        ], Prefs.pref('notifications', 'updatecount'))),
        help("Requires you to have donated and disabled ads in favor of the notifications widget (Awesome perks tab). This setting applies only to the notifications widget which is on the site index page. Updates the notifications count badge when a notification is clicked, when you have a [removed listing] notification, or always."),

        section('Classifieds', [
            userInput('Signature', 'classifieds', 'signature', Prefs.pref('classifieds', 'signature')),
            help("Message automatically inserted in the 'Message' field of Classified listings you create manually."),
            buttons('Auto-close when listed successfully', 'classifieds', 'autoclose', yesno(Prefs.pref('classifieds', 'autoclose'))),
            help("Automatically close the page you get (your Classifieds listings) whenever you successfully post a Classifieds listing manually. (Chrome only)"),
        ]),

        section('rep.tf integration', [
            buttons('Enabled', 'reptf', 'enabled', yesno(Prefs.enabled('reptf'))),
            help("Adds a rep.tf button to mini profiles and profile pages. Easily check a user's rep.tf bans by going to their profile page. The + next to Community will be green (clean) or red (has bans). Click on it to see who issued the bans and their reasoning.")
        ]),

        section('Classifieds quicklisting', [
            buttons('Enabled', 'quicklist', 'enabled', yesno(Prefs.enabled('quicklist'))),
            help("Adds Select Page buttons to your profile. Once you have selected some items, click on the 'Quicklist selection' button. You can select a pre-defined price/message (click the button below) or enter them on the spot. The items will be listed sequentially with the price and message you provided. Only Team Fortress 2 is supported."),
            button('Modify Presets', 'modify-quicklists')
        ]),

        section('Pricing', [
            help("These options are used by Pricetags and Recent price changes in backpacks."),

            buttons('Price range', 'pricing', 'range', choice([
                {value: EconCC.Range.Low, label: 'Low-end'},
                {value: EconCC.Range.Mid, label: 'Mid (avg)'},
                {value: EconCC.Range.High, label: 'High-end'},
            ], Prefs.pref('pricing', 'range'))),
            help("Price range to be used."),

            buttons('Currency step', 'pricing', 'step', choice([
                {value: EconCC.Enabled, label: 'Enabled'},
                {value: EconCC.Disabled, label: 'Disabled'}
            ], Prefs.pref('pricing', 'step'))),
            help("Whether currency values should be 'prettified'. Metal is rounded to the nearest weapon (except when the value is less than one), and keys and earbuds are rounded to the nearest 20th. (1.40 ref -> 1.38, 2.27 keys -> 2.25 keys)"),
        ]),

        section('Pricetags', [
            help("This section requires your 'Item pricetags' (Team Fortress 2 tab) to be 'Game currency'. Only Team Fortress 2 is supported obviously."),

            buttons('Earbuds', 'pricetags', 'earbuds', yesno(Prefs.pref('pricetags', 'earbuds'))),
            help("Replaces earbud pricetags on the Unusual/Effect Prices pages, Classifieds, and elsewhere items have a buds pricetag with keys when turned off."),

            buttons('Value item modifications at', 'pricetags', 'modmult', choice([
                {value: 0, label: '0%'},
                {value: 0.05, label: '5%'},
                {value: 0.1, label: '10%'},
                {value: 0.2, label: '20%'},
                {value: 0.25, label: '25%'},
                {value: 0.3, label: '30%'},
                {value: 0.4, label: '40%'},
                {value: 0.5, label: '50%'}
            ], Prefs.pref('pricetags', 'modmult'))),
            help("Strange Parts, Paint."),

            buttons('Tooltips', 'pricetags', 'tooltips', yesno(Prefs.pref('pricetags', 'tooltips'))),
            help("Adds tooltips to items that are priced in keys or earbuds."),
        ]),

        section('Recent price changes in backpacks', [
            help("Only Team Fortress 2 is supported by this feature."),

            buttons('Enabled', 'changes', 'enabled', yesno(Prefs.enabled('changes'))),
            help("Shows recent price changes on backpack pages you visit."),

            buttons('Price change period', 'changes', 'period', choice([
                {value: (1000 * 60 * 60 * 8), label: '8 hours'},
                {value: (1000 * 60 * 60 * 24), label: '1 day'},
                {value: (1000 * 60 * 60 * 24 * 3), label: '3 days'},
                {value: (1000 * 60 * 60 * 24 * 5), label: '5 days'},
                {value: (1000 * 60 * 60 * 24 * 7), label: '1 week'},
            ], Prefs.pref('changes', 'period'))),
        ]),

        section('Advanced', [
            button('Reset preferences', 'reset-prefs'),
            help('Resets your preferences (including quicklists) to the default and reloades the page.'),

            button('Clear cache', 'clear-cache'),
            help('Clears all caches. Use this if you are advised to. Clicking this button will reload the page and all your unsaved changes will be lost.'),
        ]),

        '</div>',
        '</div>'
    ].join('');

    $('#settings-panes .tab-content').append(html);
    $('#modify-quicklists').click(Quicklist.modifyQuicklists);
    $('#clear-cache').click(clearCache);
    $('#reset-prefs').click(resetPrefs);
}

function clearCache() {
    Cache.names.forEach(function (name) {
        localStorage.removeItem(name);
    });

    localStorage.removeItem("backpackapikey");
    location.reload();
}

function resetPrefs() {
    localStorage.removeItem("bes-preferences");
    localStorage.removeItem("bes-quicklists");
    location.reload();
}

function addHotlinking() {
    if (location.hash) {
        $('[href="#' + location.hash.replace(/#/g, '') + '"]').tab('show');
    }

    $('#settings-tabs a').click(function () {
        location.hash = '#' + this.href.substr(this.href.indexOf('#'));
    });
}

function getSettings() {
    var opts = $('#bes .active'),
        settings = {};

    opts.each(function () {
        var $this = $(this),
            component, key, value, v;

        if (!$this.data('component')) $this = $this.parent();
        component = $this.data('component');
        key = $this.data('key');
        value = $this.hasClass('active') ? $this.val() : $this.find('.active [value]').val();

        try {
            v = JSON.parse(value);
        } catch (ex) {
            v = value;
        }

        settings[component] = settings[component] || {};
        settings[component][key] = v;
    });

    return settings;
}

function addSaveButton() {
    var saveButton = $('.panel-body-alt input[type="submit"]');

    saveButton.click(function (e) {
        e.preventDefault();
        saveButton.val('Saving...').addClass('disabled');

        Prefs.applyPrefs(getSettings());
        $.post("/my/preferences_save", $("form[action='/my/preferences_save']").serialize(), function () {
            saveButton.val('Save Settings').removeClass('disabled');
        });
    });
}

function load() {
    if (location.pathname !== '/my/preferences') return;

    addTab();
    addTabContent();
    addHotlinking();
    addSaveButton();
}

module.exports = load;

},{"../cache":3,"../page":15,"../preferences":16,"./quicklist":9}],8:[function(require,module,exports){
var Page = require('../page'),
    Prefs = require('../preferences'),
    Pricing = require('../pricing'),
    Script = require('../script');
var ec;

function modmults(e) {
    var paint = e.dataset.paintPrice,
        parts = [e.dataset['part-1Price'], e.dataset['part-2Price'], e.dataset['part-3Price']],
        bc = 0;

    if (paint) {
        bc += Pricing.fromBackpack(ec, paint).value;
    }

    if (parts[0] || parts[1] || parts[2]) {
        parts.forEach(function (part) {
            if (part) bc += Pricing.fromBackpack(ec, part).value;
        });
    }

    return bc;
}

function setupInst(next) {
    if (ec) return next();

    Pricing.ec(function (inst) {
        ec = inst;
        ec.currencies.metal.trailing = false;
        ec.currencies.earbuds.label = Prefs.pref('pricetags', 'earbuds');

        next();
    });
}

function applyTagsToItems(items) {
    var buds = Prefs.pref('pricetags', 'earbuds'),
        modmult = Prefs.pref('pricetags', 'modmult'),
        tooltips = Prefs.pref('pricetags', 'tooltips'),
        pricedef = Pricing.default(),
        clear = false;

    items.each(function () {
        var $this = $(this),
            listing = $this.attr('data-listing-steamid'),
            price = listing ? Pricing.fromListing(ec, $this.attr('data-listing-price')) : Pricing.fromBackpack(ec, $this.attr('data-p-bptf')),
            value = price.value,
            currency = price.currency,
            eq = $this.find('.equipped'),
            et = eq.text(),
            bud = !buds && /bud/.test(et),
            mults = 0,
            f, o, s;

        if (!listing) {
            mults = modmults(this);
            if (mults !== 0) {
                value += mults * modmult;

                clear = true;
                $this.attr('data-price', value);
            }

            if (mults || !pricedef) {
                clear = true;
                $this.attr('data-price', value);
            }
        }

        value = ec.convertFromBC(value, currency);

        o = {value: value || 0.001, currency: currency};
        if (/bud/.test(currency)) {
            o = ec.convertToCurrency(value, currency, 'keys');
        }

        if (listing) s = {step: EconCC.Disabled};
        else s = {};

        if (bud || mults || !pricedef) {
            // Disable step for listings
            ec.scope(s, function () {
                var di = $this.attr('data-defindex');

                ec.currencies.keys.round = listing ? 2 : 1;

                // Exception for keys and earbuds
                if (di === '5021' || di === '143') f = ec.formatCurrency(o);
                else f = ec.format(o, EconCC.Mode.Label);
            });

            eq.html((listing ? '<i class="fa fa-tag"></i> ' : '~') + f);
        }

        if (tooltips && /key|bud/.test(currency)) {
            ec.scope(s, function () {
                eq.attr('title', ec.format(o, EconCC.Mode.Long)).attr('data-suite-tooltip', '').addClass('pricetags-tooltip');
            });
        }
    });

    // Clear price cache for calculateValue()
    if (clear && unsafeWindow.calculateValue) {
        Script.exec('$("' + items.selector + '").removeData("price");');
        unsafeWindow.calculateValue();
    }

    if (tooltips) {
        Page.addTooltips($('.pricetags-tooltip'));
    }
}

function applyTagsToAvg(avg) {
    if (!Prefs.pref('pricetags', 'earbuds')) {
        ec.currencies.keys.round = 1;
        // /unusuals, /effects
        avg.each(function () {
            var $this = $(this),
                value = ec.convertToCurrency($this.attr('data-price'), 'metal', 'keys');

            $this.find('.equipped').text('avg ' + ec.formatCurrency(value));
        });
    }
}

function enabled() {
    return Page.appid() === 440 && (
        Prefs.pref('pricetags', 'earbuds') !== true ||
        Prefs.pref('pricetags', 'modmult') !== 0.5 ||
        Prefs.pref('pricetags', 'tooltips') !== false ||
        !Pricing.default()
    );
}

function load() {
    var items, avg;

    if (!enabled()) return;

    items = $('.item[data-p-bptf-all]:not([data-vote])');
    avg = $('[data-classes]');

    if (!items.length && !avg.length) return;

    setupInst(function () {
        applyTagsToItems(items);
        applyTagsToAvg(avg);
    });
}

module.exports = load;

module.exports.setupInst = setupInst;
module.exports.applyTagsToItems = applyTagsToItems;
module.exports.enabled = enabled;

},{"../page":15,"../preferences":16,"../pricing":17,"../script":18}],9:[function(require,module,exports){
var Page = require('../page'),
    Script = require('../script'),
    Prefs = require('../preferences');

var currencyNames = {"long":{"earbuds":["bud","buds"],"keys":["key","keys"],"metal":["ref","ref"]},"short":{"earbuds":["b","b"],"keys":["k","k"],"metal":["r","r"]}},
    defaults = [
        {metal: 0.05, keys: 0, earbuds: 0, message: ""},
        {metal: 0.11, keys: 0, earbuds: 0, message: ""},
        {metal: 0, keys: 1, earbuds: 0, message: ""}
    ],
    values;

function loadQuicklists() {
    var customlists = localStorage.getItem("bes-quicklists");

    if (customlists) {
        values = JSON.parse(customlists);
    } else {
        values = defaults;
        localStorage.setItem("bes-quicklists", JSON.stringify(values));
    }
}

function addQuicklistPanelButtons() {
    $('#backpack').closest('.panel').find('.panel-heading .pull-right').html(
        '<a id="bp-custom-select-ql" class="btn btn-default btn-primary btn-xs disabled" href="##" style="margin-top: -2px;">Quicklist selection</a>'+
        ' <a id="show-markdown-modal" class="btn btn-default btn-primary btn-xs" href="##" style="margin-top: -2px;">Convert to text</a>'
    );
}

function updateSelectQuicklist() {
    $("#bp-custom-select-ql").toggleClass("disabled", !unsafeWindow.selection_mode);
}

function onActionButtonClick() {
    var $this = $(this),
        action = $this.data('action');

    if (action === 'select') {
        copyButtonValues(values[$(this).data('idx')], $('.ql-button-values'));
    } else if (action === 'listbatch') {
        listSelection(buttonValue($('.ql-button-values')));
        Page.hideModal();
    }
}

function findSample() {
    return $('[data-listing-offers-url]').first();
}

function currentSelection() {
    return $('.item:not(.spacer,.unselected,.ql-cloned):visible').filter(function () {
        var item = $(this);
        return item.data("can-sell") && !item.data("listing-steamid");
    });
}

function qlFormatValue(value, short) {
    var str = [],
        cnames = currencyNames[short ? "short" : "long"],
        space = short ? "" : " ";

    if (value.earbuds) str.push(value.earbuds + space + cnames.earbuds[+(value.earbuds !== 1)]);
    if (value.keys) str.push(value.keys + space + cnames.keys[+(value.keys !== 1)]);
    if (value.metal) str.push(value.metal + space + cnames.metal[+(value.metal !== 1)]);
    return str.join(', ');
}

function addStyles() {
    Page.addStyle(
        ".ql-button-value-idx { margin-right: 3px; }"+
        ".ql-button-value { width: 70px; height: 32px; margin-bottom: 3px; margin-top: -2px; }"+
        ".ql-message { height: 32px; margin-bottom: 15px; }"+
        ".ql-button-message-label { margin-top: 4px; margin-left: 1px; }"+
        ".ql-remove-button { margin-left: 15px; }"+
        ".ql-label { display: inline-block; }"+
        ".ql-label-metal { padding-left: 1px; } .ql-label-keys { padding-left: 39px; } .ql-label-earbuds { padding-left: 40px; }"
    );
}

function quicklistSelectHtml(value, idx) {
    return '<a class="btn btn-primary ql-button-value-idx ql-action-button" data-action="select" data-idx="' + idx + '" style="margin-right: 3px;">' + qlFormatValue(value, true) + '</a>';
}

function quicklistBtnHtml(metal, keys, earbuds, message, remove) {
    return '<div class="ql-button-values form-inline">'+
        '<div class="ql-label ql-label-metal"><label>Metal</label></div>'+
        ' <div class="ql-label ql-label-keys"><label>Keys</label></div>'+
        ' <div class="ql-label ql-label-earbuds"><label>Earbuds</label></div> '+
        (remove !== false ? '<a class="btn btn-primary btn-xs ql-remove-button">Remove</a>' : '') + '<br>'+
        '<input type="number" class="ql-button-value ql-metal form-control" value="' + metal + '"> '+
        '<input type="number" class="ql-button-value ql-keys form-control" value="' + keys + '"> '+
        '<input type="number" class="ql-button-value ql-earbuds form-control" value="' + earbuds + '"> '+
        '<br><label class="ql-button-message-label">Message </label> '+
        '<input type="text" class="ql-message form-control" value="' + Page.escapeHtml(message) + '">'+
        '</div>';
}

function selectQuicklist() {
    var selection;
    if (!findSample().length) {
        return window.alert("Create a regular listing first, so the trade offer url can be copied.");
    }

    selection = currentSelection();
    if (!selection.length) {
        return window.alert("No listable items in this selection.");
    }

    var html =
        "<p>Select a preset for this batch of items, or enter one manually. Click on the respective button to fill in the values.</p>"+
        "<div id='ql-cloned-batch' class='row'></div>"+
        "<div id='ql-button-listing' class='row'>";

    values.forEach(function (vals, idx) {
        html += quicklistSelectHtml(vals, idx);
    });

    html += "</div><br>";
    html += quicklistBtnHtml("", "", "", "", false);

    unsafeWindow.modal("List Items", html, '<a class="btn btn-default btn-primary ql-action-button" data-action="listbatch">List Batch</a>');

    $("#ql-cloned-batch").html(selection.clone()).find('.item').addClass('ql-cloned');
    $("#ql-button-listing .ql-select-msg").last().css('margin-bottom', '-8px');
    $(".ql-button-value-idx").tooltip({
        html: false,
        title: function () { return values[$(this).data('idx')].message || "(none)"; },
        placement: 'top'
    });

    Page.addItemPopovers($('.ql-cloned'), $('#ql-cloned-batch'));
}

function addEventListeners() {
    $(document).on('click', '.ql-action-button', onActionButtonClick);
    $('.item:not(.spacer)').click(updateSelectQuicklist);

    $("#bp-custom-select-ql").click(function () {
        if (unsafeWindow.selection_mode) selectQuicklist();
    });
}


function listSelection(value) {
    var selection = currentSelection(),
        sample = findSample(),
        items = [],
        at = 0;

    _clearSelection();
    unsafeWindow.updateClearSelectionState();
    addQuicklistPanelButtons();

    selection.each(function () {
        var $this = $(this);
        items.push($this.data('id'));

        $this.find('.equipped').html('<i class="fa fa-spin fa-spinner"></i>');
    });

    function next() {
        if (!items[at]) return;
        listItem(items[at], value, sample, function () {
            at += 1;
            next();
        });
    }

    next();
}

function listItem(id, value, sample, then) {
    var payload = {
        details: value.message,
        offers: +!!sample.data('listing-offers-url'), // value -> bool -> int
        buyout: sample.data('listing-buyout'),
        tradeoffer_url: sample.data('listing-offers-url'),
        'user-id': Page.csrfToken(),
        metal: value.metal,
        keys: value.keys,
        earbuds: value.earbuds
    };

    // id: current item id
    $.post("http://backpack.tf/classifieds/add/" + id, payload, function (page) {
        var ok = /<i class="fa fa-check-circle"><\/i> Your listing was posted successfully. <\/div>/.test(page),
            item = $('[data-id="' + id + '"]');

        item.css('opacity', 0.6).data('can-sell', 0)
            .find('.equipped').html(ok ? '<i class="fa fa-tag"></i> ' + qlFormatValue(value, false) : '<i class="fa fa-exclamation-circle" style="color:red"></i>');

        if (!ok && !window.confirm("Error occured, continue listing?")) return;
        if (then) then();
    });
}

function collectButtonValues() {
    var elems = $('.ql-button-values'),
        values = [];

    elems.each(function () {
        values.push(buttonValue($(this)));
    });

    return values;
}

function buttonValue(elem) {
    return {
        metal: +(Math.abs(parseFloat(elem.find('.ql-metal').val())).toFixed(2)) || 0,
        keys: Math.abs(parseInt(elem.find('.ql-keys').val(), 10)) || 0,
        earbuds: Math.abs(parseInt(elem.find('.ql-earbuds').val(), 10)) || 0,
        message: elem.find('.ql-message').val() || ""
    };
}

function copyButtonValues(value, elem) {
    var i;

    for (i in value) {
        if (!value.hasOwnProperty(i)) continue;
        elem.find('.ql-' + i).val(value[i] || (i === "message" ? "" : "0"));
    }
}

function modifyQuicklists() {
    var html =
        "<p>Add, edit, and remove quicklist presets here. Metal can have two decimals, keys and earbuds must be integers (no decimals). If any value is missing, it is defaulted to 0, with the exception of the message, which then is empty.</p>"+
        "<div id='ql-button-listing'>";

    values.forEach(function (vals) {
        html += quicklistBtnHtml(vals.metal, vals.keys, vals.earbuds, vals.message);
    });
    html += "</div>"+
        '<a class="btn btn-default ql-add-button">Add</a>';

    unsafeWindow.modal("Modify Quicklist Presets", html, '<a class="btn btn-default btn-primary ql-save-button">Save</a>');

    $('.ql-save-button').click(function () {
        values = collectButtonValues().filter(function (v) {
            return (v.metal || v.keys || v.earbuds) && isFinite(v.metal) && isFinite(v.keys) && isFinite(v.earbuds);
        });

        localStorage.setItem("bes-quicklists", JSON.stringify(values));
        Page.hideModal();
    });

    $('.ql-add-button').click(function () {
        $("#ql-button-listing").append(quicklistBtnHtml("", "", "", ""));
    });

    $('#ql-button-listing').on('click', '.ql-remove-button', function () {
        $(this).parent().remove();
    });
}

function selectItem(element) { element.removeClass('unselected'); }
function unselectItem(element) { element.addClass('unselected'); }

function addSelectPage() {
    function selectItems(items) {
        unsafeWindow.selection_mode = true;
        selectItem(items);

        unsafeWindow.updateClearSelectionState();
        unsafeWindow.calculateValue();
        updateSelectQuicklist();
    }

    $('#backpack').on('click', '.select-page', function () {
        var page = +this.dataset.page,
            pageitems;

        if (page >= 1) {
            pageitems = $('.pagenum[data-page-num="' + page + '"]').nextUntil('.pagenum').not('.spacer').filter(':visible');
        } else { // new items
            pageitems = $('#newlist .item');
        }

        if (!pageitems.length) return;

        if (unsafeWindow.selection_mode) {
            if (pageitems.length === pageitems.not('.unselected').length) { // all == selected
                unselectItem(pageitems);

                if ($('.item:not(.unselected)').length === 0) {
                    _clearSelection();
                    return;
                }
            } else {
                selectItems(pageitems);
            }
        } else {
            unselectItem($('.item'));
            selectItems(pageitems);
        }
    });
}

function _clearSelection() {
    unsafeWindow.clearSelection();
    updateSelectQuicklist();
}

function addSelectPageButtons() {
    $('.pagenum').each(function () {
        var $this = $(this),
            label = $this.find('.page-anchor'),
            page = label[0].id.replace('page', ''),
            sp = $this.find('.select-page');

        if (sp.length) {
            $this.attr('data-page-num', page);
            sp.attr('date-page', page);
            return;
        }

        if (!$this.nextUntil('.pagenum').not('.spacer').filter(':visible').length) return;
        $this.attr('data-page-num', page);
        label.after('<span class="btn btn-primary btn-xs pull-right select-page" data-page="' + page + '" style="margin-right: 16px;">Select Page</span>');
    });
}

function addHooks() {
    $('#clear-selection').click(function () {
        if (!$(this).hasClass('disabled')) {
            updateSelectQuicklist();
        }
    });

    Script.exec("var old_updateMargins = window.updateMargins;"+
                addSelectPageButtons+
                "window.updateMargins = function () { old_updateMargins(); addSelectPageButtons(); }");
}

function load() {
    addStyles();
    loadQuicklists();

    if (Page.isBackpack()) {
        addHooks();
        addSelectPage();
        addSelectPageButtons();
    }

    if (!Page.isUserBackpack() || Page.appid() !== 440 || !Prefs.enabled('quicklist')) return;

    addQuicklistPanelButtons();
    addEventListeners();
}

module.exports = load;
module.exports.modifyQuicklists = modifyQuicklists;

},{"../page":15,"../preferences":16,"../script":18}],10:[function(require,module,exports){
var MenuActions = require('../menu-actions');
var Script = require('../script');

var refreshed = [],
    listings;

function addRefreshButtons() {
    $('a.listing-report').each(function () {
        $(this).parent().prepend(
            '<a class="btn btn-xs btn-bottom btn-primary listing-refreshbp" data-tip="top" title="" data-original-title="Update this user\'s backpack.">'+
            '<i class="fa fa-sw fa-refresh"></i>'+
            '</a>'
        );
    });

    listings = !!$('.listing-refreshbp').length;
}

function addButtonTooltips() {
    Script.exec("$('.listing-refreshbp').tooltip({placement: get_tooltip_placement, animation: false});");
}

function updateBackpack(steamid, next) {
    if (refreshed[steamid]) {
        next();
    } else {
        refreshed.push(steamid);
        $.get("http://backpack.tf/profiles/" + steamid, next);
    }
}

function findSteamid(refresh) {
    return refresh.closest('.media.listing').find('.media-object').find('li').data('listing-steamid');
}

function addButtonListeners() {
    $('.listing-buttons').on('click', '.listing-refreshbp', function () {
        var $this = $(this);

        updateBackpack(findSteamid($this), function () {
            $this.fadeOut();
        });
    });
}

function refreshAll(e) {
    var steamids = [],
        at = 0;

    if (e) e.preventDefault();

    $('.listing-refreshbp').each(function () {
        var $this = $(this);
        steamids.push([findSteamid($this), $this]);
    });

    (function next() {
        if (steamids[at]) {
            updateBackpack(steamids[at][0], function () {
                steamids[at][1].fadeOut();
                at += 1;
                next();
            });
        } else {
            location.reload();
        }
    }());
}

function addMenuAction() {
    MenuActions.addAction({
        name: 'Refresh All',
        icon: 'fa-refresh',
        id: 'refresh-all',
        click: refreshAll
    });
}

function addRallHeader(elem) {
    return function () {
        var header = $('<span class="pull-right"><small><a href="#" id="header-refresh-all">Refresh All</a></small></span>');
        header.find('#header-refresh-all').click(refreshAll);
    
        elem.append(header);
    };
}


function load() {
    addRefreshButtons();

    if (!listings) return;
    
    addButtonTooltips();
    addButtonListeners();
    page('/classifieds/', addRallHeader($('#media-container-row-alt .panel-heading:first')));
    page('/stats/:quality/:name/:tradable/:craftable', addRallHeader($('#page-content .panel-heading:contains(Classified)')));
    addMenuAction();
}

module.exports = load;

},{"../menu-actions":14,"../script":18}],11:[function(require,module,exports){
/* global rep_gmp */
var Script = require('../script'),
    Cache = require('../cache'),
    Page = require('../page');

var bans = [],
    bansShown = false,
    cachePruneTime = 60 * 30 * 1000, // 30 minutes (in ms)
    banIssuers = ["steamBans", "opBans", "stfBans", "bzBans", "ppmBans", "bbgBans", "tf2tBans", "bptfBans", "srBans", "mctBans"],
    reptfSuccess = true,
    steamid, repCache;

function addMiniProfileButton() {
    function generateMiniProfile(element) {
        var profile = rep_gmp(element);

        profile.find('.stm-tf2outpost').parent().html('<i class=\"stm stm-tf2outpost\"></i> Outpost');
        profile.find('.stm-bazaar-tf').parent().html('<i class=\"stm stm-bazaar-tf\"></i> Bazaar');
        profile.find('.mini-profile-third-party').append(
            ' <a class=\"btn btn-default btn-xs\" target=\"_blank\" href=\"http://rep.tf/'+ element.attr('data-id')+'\">'+
            '<i class=\"fa fa-check-square\"></i> RepTF</a>'
        );
        return profile;
    }

    Script.exec('var rep_gmp = generateMiniProfile;'+
                'window.generateMiniProfile = ' + generateMiniProfile);
}

function showBansModal() {
    if (!bans.length) return;

    var html = "<b style='color:red'>User is banned on</b> ⋅ <a href='http://rep.tf/" + steamid + "' target='_blank'>rep.tf</a><br><br><ul>";
    bans.forEach(function (ban) {
        html += "<li><b>" + ban.name + "</b> - " + ban.reason + "</li>";
    });
    html += "</ul>";

    unsafeWindow.modal("rep.tf bans", html);
}

function addProfileButtons() {
    $('.btn > .stm-tf2outpost').parent().after(' <a class="btn btn-primary btn-xs" href="http://rep.tf/' + steamid + '" target="_blank"><i class="fa fa-check-square"></i> rep.tf</a>');
    $('small:contains(Community)').html('Community <a id="showrep" style="font-size: 14px; cursor: pointer;">+</a>');

    $('#showrep').on('click', function () {
        var $this = $(this),
            open = $this.text() === '+';

        if (open && !bansShown) {
            showBansModal();
            bansShown = true;
        }

        $this.text(open ? '-' : '+');
        $('.rep-entry').toggle(open);
    });
}

function addIssuers() {
    var groups = [];

    function spinner(name) {
        var id = name.replace(/\.|-/g, '').toLowerCase();
        groups.push(
            "<li id='" + id + "ban' class='rep-entry' style='display: none'><small>" + name + "</small>"+
            "<span class='label pull-right label-default rep-tooltip' data-placement='bottom'>"+
            "<i class='fa fa-spin fa-spinner'></i></span></li>"
        );
    }

    spinner("Outpost");
    spinner("Bazaar");
    spinner("Scrap.tf");
    spinner("PPM");
    // Uncomment to enable
    //spinner("TF2-Trader");
    //spinner("MCT");
    //spinner("BBG");
    $('.community-statii .stats li').last().after($(groups.join("")));
}

function checkBans() {
    var value;

    repCache = new Cache("bes-cache-reptf", cachePruneTime);
    value = repCache.get(steamid);

    if (value.update) {
        updateCache();
    } else {
        showBans(value.value);
    }
}

function compactResponse(json) {
    var compact = {success: json.success};

    banIssuers.forEach(function (issuer) {
        compact[issuer] = {banned: json[issuer].banned, message: json[issuer].message};
    });

    return compact;
}

function updateCache() {
    GM_xmlhttpRequest({
        method: "POST",
        url: "http://rep.tf/api/bans?str=" + steamid,
        onload: function (resp) {
            var json;

            try {
                json = compactResponse(JSON.parse(resp.responseText));
            } catch (ex) {
                json = {success: false};
            }

            reptfSuccess = json.success;
            repCache.set(steamid, json);
            if (json.success) repCache.save();

            showBans(json);
        }
    });
}

function addRepTooltips() {
    $('.rep-tooltip').tooltip({
        html: true,
        title: function () {
            return $(this).data('content');
        }
    });
}

function showBans(json) {
    function ban(name, obj) {
        var id = name.replace(/\.|-/g, '').toLowerCase(),
            status = $('#' + id + 'ban').find('.rep-tooltip');

        status.removeClass('label-default');

        if (reptfSuccess) {
            if (!obj.banned) return;

            if (obj.banned === "bad") {
                bans.push({name: name, reason: obj.message});
            }

            status.addClass("label-" + ({good: "success", bad: "danger"}[obj.banned]))
            .data('content', obj.message)
            .text({good: "OK", bad: "BAN"}[obj.banned]);
        } else {
            status.addClass("label-warning").data('content', "Ban status could not be retrieved.").text("ERR");
        }
    }

    ban("SteamRep", json.srBans);
    ban("Outpost", json.opBans);
    ban("Bazaar", json.bzBans);
    ban("Backpack.tf", json.bptfBans);
    ban("Scrap.tf", json.stfBans);
    ban("PPM", json.ppmBans);
    //ban("TF2-Trader", json.tf2tBans);
    //ban("MCT", json.mctBans);
    //ban("BBG", json.bbgBans);

    addRepTooltips();
    $('#showrep').css('color', reptfSuccess ? (bans.length ? '#D9534F' : '#5CB85C') : '#F0AD4E');
    //if (bans.length) $('body').append('<iframe src="https://youtube.com/embed/VlszRjKJqbA?autoplay=1&start=8&end=35" style="display:none;"></iframe>');
}

function load() {
    // Global
    addMiniProfileButton();

    // Profiles only
    if (!Page.isProfile()) return;
    steamid = Page.profileSteamID();

    addProfileButtons();
    addIssuers();
    checkBans();
}

module.exports = load;

},{"../cache":3,"../page":15,"../script":18}],12:[function(require,module,exports){
var Script = require('../script'),
    Pricing = require('../pricing'),
    Page = require('../page');

// function (rgb) { return ((parseInt(rgb.substr(0, 2), 16) - 45).toString(16) + (parseInt(rgb.substr(2, 2), 16) - 45).toString(16) + (parseInt(rgb.substr(4, 2), 16) - 45).toString(16)).toUpperCase(); }
var appQualities = {
    440: {
        qualities: {
            // background, border
            "Normal": ["#B2B2B2", "#858585"],
            "Genuine": ["#4D7455", "#204728"],
            //"rarity2": "#8D834B",
            "Vintage": ["#476291", "#1a3564"],
            //"rarity3": "#70550F",
            "Unusual": ["#8650AC", "#59237f"],
            "Unique": ["#FFD700", "#d2aa00"],
            "Community": ["#70B04A", "#43831D"],
            //"Valve": "#A50F79",
            "Self-Made": ["#70B04A", "43831D"],
            //"Customized": ["#B2B2B2", "#858585"],
            "Strange": ["#CF6A32", "#a23d05"],
            //"Completed": ["#B2B2B2", "#858585"],
            "Haunted": ["#38F3AB", "#0bc67e"],
            "Collector's": ["#830000", "#560000"]
        },
        defquality: "Unique"
    },
    570: {
        qualities: {
            "Base": ["#B2B2B2", "#858585"],
            "Genuine": ["#4D7455", "#204728"],
            "Elder": ["#476291", "#1a3564"],
            "Unusual": ["#8650AC", "#59237f"],
            //"Standard": "",
            //"Community": "",
            //"Valve": "",
            "Self-Made": ["#70B04A", "#43831D"],
            //"Customized": "",
            "Inscribed": ["#CF6A32", "#a23d05"],
            //"Completed": "",
            "Cursed": ["#8650AC", "#59237f"],
            "Heroic": ["#8650AC", "#59237f"],
            "Favored": ["#FFFF00", "#D2D22D"],
            "Ascendant": ["#EB4B4B", "#BE1E1E"],
            "Autographed": ["#ADE55C", "#80B82F"],
            "Legacy": ["#FFFFFF", "#D2D2D2"],
            "Exalted": ["#CCCCCC", "#9F9F9F"],
            "Frozen": ["#4682B4", "#195587"],
            "Corrupted": ["#A52A2A", "#780303"],
            "Auspicious": ["#32CD32", "#50A050"],
        },
        defquality: "Base"
    },
    730: {
        qualities: {
            "Normal": ["#B2B2B2", "#858585"],
            //"Normal": ["#D2D2D2", "#A5A5A5"],
            "StatTrak™": ["#CF6A32", "#a23d05"],
            "Souvenir": ["#FFD700", "#d2aa00"],
            "★": ["#8650AC", "#59237f"],
            //"★ StatTrak™": ["#8650AC", "#59237f"],
            "Prototype": ["#70B04A", "#43831D"]
        },
        defquality: "Normal"
    }
};

var descids = {"Team Fortress 2": 440, "Counter-Strike: Global Offensive": 730, "Dota 2": 570};
var appids = {},
    reqcache = {},
    req, ec;

appids.tf = appids.tf2 = 440;
appids.cs = appids.csgo = appids.go = 730;
appids.dota = appids.dota2 = appids.dt = appids.dt2 = 570;
appids.scm = appids.market = appids.steam = 1;

function makeRequest(url, done, query) {
    if (req) req.abort();

    req = GM_xmlhttpRequest({
        method: "GET",
        url: url,
        onload: function (content) {
            var json = JSON.parse(content.responseText);
            done(json, query);
        }
    });
}

function parseQuery(json, query) {
    var html, items;

    if (!json.total_count) {
        return processCustomResults(false);
    }

    html = $($.parseHTML(json.results_html));
    items = [];

    html.filter('.market_listing_row_link').each(function () {
        var $this = $(this);

        items.push({
            img: $this.find('.market_listing_item_img').attr('src'),
            price: $this.find('.market_table_value span:first').text(),
            qty: $this.find('.market_listing_num_listings_qty').text(),
            name: $this.find('.market_listing_item_name').text(),
            url: this.href,
            description: $this.find('.market_listing_game_name').text()
        });
    });

    if (query) {
        reqcache[query] = items;
        setTimeout(function () { reqcache[query] = null; }, 1000 * 60 * 5);
    }

    if (ec) {
        processCustomResults(items);
    } else {
        Pricing.ec(function (e) {
            ec = e;
            processCustomResults(items);
        });
    }
}

function styleGame(iname, appid) {
    var qualities = appQualities[appid],
        q, qname, qreg, i;

    if (!appid || !qualities) return {name: iname};

    for (i in qualities.qualities) {
        qreg = new RegExp("^" + i + " ");
        if (qreg.test(iname)) {
            q = qualities.qualities[i];
            qname = i;
            iname = iname.replace(qreg, "");
            break;
        }
    }

    if (!q) {
        q = qualities.qualities[qualities.defquality];
        qname = qualities.defquality;
    }

    if (!Array.isArray(q)) q = [q, q];

    return {name: iname, style: "background-color:" + q[0] + ";border-color:" + q[1] + ";", qualityName: qname};
}

function processCustomResults(items) {
    var searchbox = $('#navbar-search-results'),
        results = $("<ul>"),
        descs = {},
        idesc;

    function appendres(i) { results.append(i); }

    searchbox.show();
    if (items) {
        items.forEach(function (i) {
            // 10/10 Steam
            if (i.qty === "0") return;

            var element = $('<li class="mini-suggestion">'), // for proper styles
                links = $('<div class="buttons">'),
                desc = i.description,
                descid = descids[desc],
                styl = styleGame(i.name, descid),
                name = styl.name;

            links
                .append('<a class="btn btn-default btn-xs scm-search-tooltip" href="' + i.url + '"'+
                        ' title="' + ec.f((+(i.price.split(' ')[0].substr(1)) / 1.1472) + ' usd:Long') + '">' + i.price + '</a>')
                .append('<a class="btn btn-default disabled btn-xs">' + i.qty + ' listed</a>')
            ;

            element
                .append("<div class='item-mini scm-search-tooltip'" + (styl.style ? " style='" + styl.style + "' title='" + styl.qualityName + "'" : "") + ">"+
                        "<img src='" + i.img + "'></div>")
                .append("<div class='item-name'>" + name + "</div>")
                .append(links)
            ;

            descs[desc] = descs[desc] || [];
            descs[desc].push(element);
        });

        for (idesc in descs) {
            results.append("<li class='header'>" + idesc + "</li>");
            descs[idesc].forEach(appendres);
        }
    } else {
        results.append('<li class="header">No results found.</li>');
    }

    searchbox.html(results.html());
    Page.addTooltips($('.scm-search-tooltip'), '#navbar-search-results');
}

function searchURL(appid, query) {
    return 'http://steamcommunity.com/market/search/render/?query=' + encodeURIComponent(query) + (appid === 1 ? '' : '&appid=' + appid) +
        '&currency=1&start=0&count=6';
}

function processCustom(query) {
    var parts = query.split(':'),
        scope = parts[0],
        search = parts.splice(1).join(':'),
        appid = appids[scope];

    if (!search || !appid) return;

    if (reqcache[query]) processCustomResults(reqcache[query]);
    else makeRequest(searchURL(appid, search), parseQuery, query);
}

function checkCustom(query) {
    return query.split(':').length >= 2;
}

function addEventListeners() {
    Script.exec('$("#navbar-search").off("keyup");');

    $('#navbar-search').keyup(function() {
        var query = $(this).val().trim();
        if (unsafeWindow.old_query !== query) {
            clearTimeout(unsafeWindow.search_timer);
            unsafeWindow.search_timer = setTimeout(function () {
                if (checkCustom(query)) processCustom(query);
                else unsafeWindow.processSearch(query);
            }, 350);
            unsafeWindow.old_query = query;
        }
    });
}

function load() {
    addEventListeners();
}

module.exports = load;

},{"../page":15,"../pricing":17,"../script":18}],13:[function(require,module,exports){
var Page = require('../page');

var BadgeSelfMade = {
    title: 'Self-Made User Badge',
    content: 'I made this!',
    style: 'border-color:#3e6527;background-color:#70B04A;box-shadow:inset 0 0 14px #68a046;',
    icon: 'fa-paint-brush'
};

var BadgeSupporter = {
    title: 'Enhancement Suite Supporter',
    content: 'This caring heart donated to the Enhancement Suite project! Thank you!',
    class: 'gold',
    icon: 'fa-trophy',
};

var users = {
    "76561198070299574": {badges: [BadgeSelfMade, BadgeSupporter], color: '#028482'}
};

function renderUserBadges(badges) {
    var html = '';

    badges.forEach(function (badge) {
        html += '<div data-title="' + badge.title + '" data-content="' + badge.content + '"'+
            ' class="user-badge bes-badge' + (badge.class ? ' ' + badge.class : '') + '"' + (badge.style ? ' style="' + badge.style + '"' : "") + '>'+
            '<i class="fa ' + badge.icon + '"></i></div>';
    });

    $('.user-badge-list .user-badge:last').after(html);
}

function badgePopovers() {
    $('.user-badge.bes-badge').popover({html: true, trigger: 'hover', placement: 'bottom'});
}

function changeUserColors(handle) {
    handle.each(function () {
        var id = this.dataset.id,
            u = users[id];

        if (!u || !u.color) return;

        this.style.fontWeight = 'bold';
        this.style.setProperty('color', u.color, 'important');
    });
}

function load() {
    var handle = Page.users(),
        user;

    // Name colors
    if (handle.length && location.pathname !== '/donate') {
        changeUserColors(handle);
    }

    // User badges
    if (!Page.isProfile()) return;

    user = users[Page.profileSteamID()];
    if (!user || !user.badges) return;

    renderUserBadges(user.badges);
    badgePopovers();
}

module.exports = load;

},{"../page":15}],14:[function(require,module,exports){
var Page = require('./page');
var actions = [];

exports.addAction = function (obj) {
    actions.push(obj);
    if (Page.loaded) exports.applyActions();
};

exports.applyActions = function () {
    if (!Page.loggedIn()) return;
    if (!actions.length) return;

    if (!document.getElementById('bp-custom-actions')) {
        $('#profile-dropdown-container .dropdown-menu .divider').eq(1).after('<li class="divider" id="bp-custom-actions"></li>');
    }

    var html = "";
    actions.forEach(function (action) {
        html += '<li><a href="#" id="' + action.id + '"><i class="fa fa-fw ' + action.icon + '"></i> ' + action.name + '</a></li>';
    });

    $('#bp-custom-actions').before(html);
    actions.forEach(function (action) {
        document.getElementById(action.id).addEventListener('click', function (e) {
            e.preventDefault();
            action.click.call(this);
        }, false);
    });

    actions = [];
};

},{"./page":15}],15:[function(require,module,exports){
var Script = require('./script');

var nonNumerical = /\D/g;

var state = {
    ownid: "",
    profile: false,
    backpack: false,
    ownprofile: false,
    ownbackpack: false,
    steamid: "",
    loggedin: false,
    token: "",
    appid: 0,
    indexpage: false,
    loaded: false,
    handles: {}
};

function getter(name, val) {
    exports[name] = function () { return state[val]; };
}

exports.init = function () {
    state.steamid = $('.profile .avatar-container a')[0] || "";
    state.loggedin = !!document.getElementById("profile-dropdown-container");

    if (state.steamid) {
        state.profile = true;
        state.backpack = state.profile && !!document.getElementById('backpack');
        state.steamid = state.steamid.href.replace(nonNumerical, '');
    }

    if (state.loggedin) {
        state.ownid = $('#profile-dropdown-container .fa-briefcase').parent().attr('href').replace(nonNumerical, '');
        if (state.profile) {
            state.ownprofile = state.ownid === state.steamid;
        }

        state.token = unsafeWindow.userID || $('#profile-dropdown-container .fa-sign-out').parent().attr('href').replace(/(.*?=)/, '');
        state.ownbackpack = state.ownprofile && state.backpack;
    }

    state.indexpage = location.pathname === '/';

    state.appid = 440;
    if (location.hostname.indexOf("dota2") !== -1) state.appid = 570;
    state.handles = $('.handle');
};

exports.state = state;

getter('isProfile', 'profile');
getter('isBackpack', 'backpack');
getter('profileSteamID', 'steamid');
getter('loggedIn', 'loggedin');
getter('userSteamID', 'ownid');
getter('isUserProfile', 'ownprofile');
getter('isUserBackpack', 'ownbackpack');
getter('csrfToken', 'token');
getter('appid', 'appid');
getter('isIndexPage', 'indexpage');
getter('ready', 'loaded');
getter('users', 'handles');

exports.hideModal = function () {
    Script.exec('$("#active-modal").modal("hide");');
};

exports.addTooltips = function (elem, container) {
    if (!elem) elem = $("[data-suite-tooltip]");
    elem.tooltip({container: container || 'body'});
};

// Copypastas for Firefox support
exports.addItemPopovers = function (item, container) {
    item.mouseenter(function() {
        var $this = $(this),
            id = (Math.random() + "") + (Date.now() + "");

        if ($this.parent().hasClass('item-list-links')) {
            return;
        }

        // Firefox support
        $this.attr('data-bes-id', id);
        Script.exec('(function () {'+
                    'var jq = $("[data-bes-id=\\"' + id + '\\"]");'+
                    'jq.popover({animation: false, html: true, trigger: "manual", placement: window.get_popover_placement, content: window.createDetails(jq)});'+
                    '}());');

        setTimeout(function () {
            if ($this.filter(':hover').length) {
                // Firefox support
                Script.exec('$(".popover").remove(); $("[data-bes-id=\\"' + id + '\\"]").popover("show"); $(".popover").css("padding", 0);');
                $('#search-bazaar').click(function () {
                    unsafeWindow.searchBazaar($this.data('defindex'), $this.data('quality'), $this.data('priceindex'), $this.data('craftable') == 1 ? 0 : 1, $this.data('app'));
                });

                $('#search-outpost').click(function () {
                    unsafeWindow.searchOutpost($this.data('defindex'), $this.data('quality'), $this.data('priceindex'), $this.data('craftable') == 1 ? 0 : 1, $this.data('app'));
                });

                $('#search-lounge').click(function() {
                    unsafeWindow.searchLounge($this.data('defindex'), $this.data('quality'));
                });
            }
        }, 300);
    }).mouseleave(function () {
        var $this = $(this);

        setTimeout(function () {
            if (!$this.filter(':hover').length && !$('.popover:hover').length) {
                // Firefox support
                Script.exec('$("[data-bes-id=\\"' + $this.attr('data-bes-id') + '\\"]").popover("hide");');
            }
        }, 100);
    }).on('shown.bs.popover', function () {
        Script.exec("$('.popover-timeago').timeago();");
    });

    if (container) {
        container.on('mouseleave', '.popover', function () {
            var $this = $(this);

            setTimeout(function() {
                if (!$this.is(':hover')) {
                    $this.remove();
                }
            }, 300);
        });
    }
};

exports.escapeHtml = function (message) {
    return $('<span>').text(message).text().replace(/"/g, "&quot;").replace(/'/g, "&apos;");
};

exports.addStyle = GM_addStyle;

exports.SUITE_VERSION = '1.0.0';

},{"./script":18}],16:[function(require,module,exports){
var preferences = JSON.parse(localStorage.getItem("bes-preferences") || '{"features": {}}');

exports.dirty = false;
exports.prefs = preferences;
exports.enabled = function (feat) {
    var o = preferences.features[feat];
    return o ? o.enabled : false;
};

exports.pref = function (feat, name, value) {
    var o = preferences.features[feat];
    if (!o) o = preferences.features[feat] = {};

    if (arguments.length === 2) {
        return o[name];
    } else {
        o[name] = value;
        exports.dirty = true;
    }

    return this;
};

exports.default = function (feat, name, value) {
    var o = preferences.features[feat];

    if (!o) o = preferences.features[feat] = {};
    if (!o.hasOwnProperty(name)) {
        o[name] = value;
        exports.dirty = true;
    }

    return this;
};

exports.save = function () {
    if (!exports.dirty) return;
    localStorage.setItem("bes-preferences", JSON.stringify(preferences));
};

exports.applyPrefs = function (prefs) {
    var feat, key, o;

    for (feat in prefs) {
        o = prefs[feat];
        for (key in o) {
            exports.pref(feat, key, o[key]);
        }
    }

    exports.save();
    return this;
};

},{}],17:[function(require,module,exports){
var Prefs = require('./preferences'),
    API = require('./api');

exports.ec = function (cb) {
    API.IGetPrices(function (pricelist) {
        API.IGetCurrencies(function (currencies) {
            var ec = new EconCC(currencies, pricelist);
            ec.step = Prefs.pref('pricing', 'step');
            ec.range = Prefs.pref('pricing', 'range');

            cb(ec, pricelist, currencies);
        });
    });
};

exports.default = function () {
    return Prefs.pref('pricing', 'step') === EconCC.Disabled && Prefs.pref('pricing', 'range') === EconCC.Range.Mid;
};

exports.fromListing = function (ec, price) {
    var parts = price.split(', '),
        bc = 0,
        hv = 0,
        mainc;

    parts.forEach(function (part) {
        var p = part.split(' '),
            price = +p[0],
            currency = p[1],
            v = ec.convertToBC(price, currency);

        if (v > hv) {
            hv = v;
            mainc = currency;
        }

        bc += v;
    });

    return {value: bc, currency: mainc};
};

exports.fromBackpack = function (ec, price) {
    var parts = price.split(" "),
        val = parts[0].split(/-|–/), // en dash, dash for ref (10/10)
        currency = parts[1],
        bc = 0;

    if (val[0][0] === '$') {
        val[0] = val[0].substr(1);
        currency = 'usd';
    }

    bc = ec.convertToBC(ec.valueFromRange({low: +val[0], high: +val[1], currency: currency}), currency);
    return {value: bc, currency: currency};
};

exports.unufx = {"Green Confetti":6,"Purple Confetti":7,"Haunted Ghosts":8,"Green Energy":9,"Purple Energy":10,"Circling TF Logo":11,"Massed Flies":12,"Burning Flames":13,"Scorching Flames":14,"Searing Plasma":15,"Vivid Plasma":16,"Sunbeams":17,"Circling Peace Sign":18,"Circling Heart":19,"Stormy Storm":29,"Blizzardy Storm":30,"Nuts n' Bolts":31,"Orbiting Planets":32,"Orbiting Fire":33,"Bubbling":34,"Smoking":35,"Steaming":36,"Flaming Lantern":37,"Cloudy Moon":38,"Cauldron Bubbles":39,"Eerie Orbiting Fire":40,"Knifestorm":43,"Misty Skull":44,"Harvest Moon":45,"It's A Secret To Everybody":46,"Stormy 13th Hour":47,"Attrib_Particle55":55,"Kill-a-Watt":56,"Terror-Watt":57,"Cloud 9":58,"Aces High":59,"Dead Presidents":60,"Miami Nights":61,"Disco Beat Down":62,"Phosphorous":63,"Sulphurous":64,"Memory Leak":65,"Overclocked":66,"Electrostatic":67,"Power Surge":68,"Anti-Freeze":69,"Time Warp":70,"Green Black Hole":71,"Roboactive":72,"Arcana":73,"Spellbound":74,"Chiroptera Venenata":75,"Poisoned Shadows":76,"Something Burning This Way Comes":77,"Hellfire":78,"Darkblaze":79,"Demonflame":80,"Bonzo The All-Gnawing":81,"Amaranthine":82,"Stare From Beyond":83,"The Ooze":84,"Ghastly Ghosts Jr":85,"Haunted Phantasm Jr":86,"Showstopper":3001,"Holy Grail":3003,"'72":3004,"Fountain of Delight":3005,"Screaming Tiger":3006,"Skill Gotten Gains":3007,"Midnight Whirlwind":3008,"Silver Cyclone":3009,"Mega Strike":3010,"Haunted Phantasm":3011,"Ghastly Ghosts":3012,"Frostbite":87,"Molten Mallard":88,"Morning Glory":89,"Death at Dusk":90};

},{"./api":2,"./preferences":16}],18:[function(require,module,exports){
exports.exec = function (code) {
    var scr = document.createElement('script'),
        elem = (document.body || document.head || document.documentElement);
    scr.textContent = code;

    elem.appendChild(scr);
    elem.removeChild(scr);
};

},{}]},{},[1]);
