//Begin classifieds.js
var Page = require('../page'),
    Script = require('../script'),
    Prefs = require('../preferences'),
    Pricing = require('../pricing'),
    MenuActions = require('../menu-actions'),
    Pricetags = require('./pricetags');

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

function autofillLowest(clones, auto) {
    var metal = $("#metal"),
        keys = $("#keys"),
        lowest;

    clones.each(function () {
        var val = this.dataset.listingPrice;

        if (lowest) return;
        if (this.dataset.listingIntent !== '1' || !val) return; // sellers only
        if (auto && this.dataset.listingAutomatic !== "true") return;

        val = val.split(', ');

        if (val[0].indexOf('key') !== -1) {
            lowest = {metal: parseFloat(val[1] || 0), keys: parseInt(val[0])};
        } else {
            lowest = {metal: parseFloat(val[0]), keys: 0};
        }
    });

    if (lowest) {
        metal.val(lowest.metal);
        keys.val(lowest.keys);
        Script.window.updateFormState();
    }
}

function add(sig) {
    var htm =
        '<div class="row"><div class="col-md-12 "><div class="panel panel-main" id="peek-panel">'+
        '<div class="panel-heading">Classifieds <span class="pull-right"><small><a href="#" id="classifieds-peek">Peek</a></small></span></div>'+
        '</div></div></div></div>';
    var signature = Prefs.pref('classifieds', sig),
        $details = $("#details");

    $('#page-content .row:eq(1)').before(htm);

    if (!$details.val().length) {
        $details.val(signature);
        Script.exec('$("#details").trigger("blur");');
    }

    if (Prefs.pref('classifieds', 'autopeek')) peek();
    else $("#classifieds-peek").one('click', peek);

    if (Prefs.pref('classifieds', 'autoclose')) {
        $("#classifieds-form").submit(function () {
            $.post(location.pathname, $(this).serialize()).done(function () {
                window.close();
            }).fail(function () {
                alert("Error occurred, try again later.");
                $('#button_save').prop('disabled', true).html('Create Listing');
            });
            return false;
        });
    }
}

function addAutofill() {
    var metal = $("#metal"),
        keys = $("#keys"),
        item = $('.item-singular .item'),
        val = parseFloat(item.data('price'));

    if (Prefs.pref('classifieds', 'autofill') !== 'backpack' || !val) return;
    if (metal.val().length || keys.val().length) return;

    Pricing.shared(function (ec) {
        var m = {value: val, currency: 'metal'},
            k = ec.convertToCurrency(m, 'keys');

        if (k.value >= 1) {
            m = ec.convertToCurrency({value: k.value % 1, currency: 'keys'}, 'metal');

            k.value = Math.floor(k.value);
            keys.val(parseInt(ec.formatCurrency(k), 10));
        }

        if (m.value > 0.08) {
            ec.scope({step: EconCC.Enabled, currencies: {metal: {step: 0.11}}}, function () {
                metal.val(parseFloat(ec.formatCurrency(m)));
            });
        }

        Script.window.updateFormState();
    });
}

function buy() {
    add('signature-buy');
}

function sell() {
    add('signature');
    addAutofill();
}

function global() {
    if (document.querySelector('.listing-remove')) addRemoveAllListings();
}

function load() {
    var pathname = location.pathname;

         if (/^\/classifieds\/buy\/.{1,}\/.{1,}\/.{1,}\/.{1,}\/?.*/.test(pathname)) buy();
    else if (/^\/classifieds\/relist\/.{1,}/.test(pathname)) buy();
    else if (/^\/classifieds\/sell\/.{1,}/.test(pathname)) sell();
    global();
}

module.exports = load;

//End classifieds.js
