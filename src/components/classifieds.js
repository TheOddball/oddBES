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

//This part written by: https://gist.github.com/LeonEuler/bc0abf8aa63ddeb28f25 I felt it was good to put in here. Thank you :)
function checkEscrowStuff() {
    var escrowStatusByTradeOfferUrl = {};


    function scanForTradeOfferLinks() {
        //find all hyperlinks that start with a trade offer pattern
        offerLinks = jQuery('a[href^="https://steamcommunity.com/tradeoffer/new/"]');
        //trade.tf uses a redirection thing. Add on links, checking for startswith "/user..." and endswith "/offer"
        jQuery.merge(offerLinks, jQuery('a[href^="/user/mybot/trades/"][href$="/offer"]'));
        for (var i = 0; i < offerLinks.length; i++) {
            var link = jQuery(offerLinks[i]);
            var offerUrl = link.attr("href");

            //check if url was already checked or is currently being checked (avoid ajax spam)
            if (escrowStatusByTradeOfferUrl[offerUrl] === "escrow") {
                //mark link as fucked
                link.css('background-color', '#C84B43');
                link.css('border-color', '#C84B43');
                link.css('background-image', 'none');//to remove gradient on trade.tf offer button.
                continue;
            }
            else if (escrowStatusByTradeOfferUrl[offerUrl] === "ok") {
                //new approved elite master race trader
                //leave link as-is
                continue;
            }
            else if (escrowStatusByTradeOfferUrl[offerUrl] === "pending") {
                //we're still waiting on a request
                continue;
            }

            //link not found in map; never seen this link yet.
            escrowStatusByTradeOfferUrl[offerUrl] = "pending";
            //Doing this via helper function to make sure url loop variable doesn't cause scope conflict
            checkTradeOfferPage(offerUrl);
        }
    }

    function checkTradeOfferPage(offerUrl, trueOfferUrl) {
        var requestUrl = trueOfferUrl ? trueOfferUrl : offerUrl;
        //make cross site ajax request with tampermonkey/greasemonkey
        GM_xmlhttpRequest({
            method: "GET",
            url: requestUrl,
            onload: function (responseData) {

                //Check for trade.tf redirection page, with its javascript that does a window.location redirect.
                var redirectionMatches = responseData.responseText.match(/window\.location\.href = "(https:\/\/steamcommunity\.com\/tradeoffer\/new\/[^"]+)";/);
                if (redirectionMatches && redirectionMatches.length === 2)//(first is whole match, 2nd is url)
                {
                    //pass discovered url to 1 recursive call
                    checkTradeOfferPage(offerUrl, redirectionMatches[1]);
                    return;
                }

                if (responseData.responseText.indexOf("var g_daysTheirEscrow = ") !== -1
                        && responseData.responseText.indexOf("var g_daysTheirEscrow = 0") === -1) {
                    escrowStatusByTradeOfferUrl[offerUrl] = "escrow";
                }
                else {
                    escrowStatusByTradeOfferUrl[offerUrl] = "ok";
                }
            }
        });
        //status result will take effect in next link scan
    }

    if (document.location.host === "steamcommunity.com") {
        //On a trade offer creation page itself.
        if (unsafeWindow.g_daysTheirEscrow !== 0) {
            //Mark background fucked 
            jQuery('.responsive_page_template_content').css("background-color", "darkred");
        }
    }
    else {
        //On a trading site.
        //Run repeatedly to keep scanning and changing links
        window.setInterval(scanForTradeOfferLinks, 500);
    }
}

//Thank you for letting me use this :)

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

function peekload(html) {
    $("#peek-panel").append('<div class="panel-body padded" id="peek-panel-body"></div>');
    var $ppb = $("#peek-panel-body"),
        h = $.parseHTML(html),
        buyers = [],
        sellers = [],
        autofill = Prefs.pref('classifieds', 'autofill'),
        autofillEnabled = location.href.indexOf('/sell/') !== -1 &&
            (autofill === 'lowest' || autofill === 'lowestauto'),
        clones;

    $('.item', h).each(function () {
        var $this = $(this),
            clone = this.cloneNode(true);
        clone.classList.add('classifieds-clone');
        clone.dataset.listingAutomatic = !!$this.closest('.media.listing').find('.fa-flash').length;

        if (clone.dataset.listingIntent === '0') {
            buyers.push(clone);
        } else if (clone.dataset.listingIntent === '1') {
            if (clone.dataset.listingAutomatic) {
                Page.addItemIcon($this, '<div class="arrow-icon"><i class="fa fa-bolt"></i></div>');
            }

            sellers.push(clone);
        }
    });

    if (sellers.length) {
        $ppb.append('<h5>Sellers</h5><div id="classifieds-sellers" class="row"></div>');
        $("#classifieds-sellers").html(sellers);
    }

    if (buyers.length) {
        $ppb.append('<h5>Buyers</h5><div id="classifieds-buyers" class="row"></div>');
        $("#classifieds-buyers").html(buyers);
    }

    if (!sellers.length && !buyers.length) {
        $ppb.append("<p>No buy or sell orders for this item.</p>");
    }

    clones = $('.classifieds-clone');
    if (clones.length) {
        Page.addItemPopovers(clones, $ppb);

        if (Pricetags.enabled()) {
            Pricetags.setupInst(function () {
                Pricetags.applyTagsToItems(clones);
            });
        }

        if (autofillEnabled) {
            autofillLowest(clones, autofill === 'lowestauto');
        }
    }
}

function peek(e) {
    var classiesString = '/classifieds?' + $('.item').data('query_string');
    if (e) e.preventDefault();

    $.ajax({
        method: "GET",
        url: classiesString,
        dataType: "html"
    }).done(peekload);
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
        checkEscrowStuff();

         if (/^\/classifieds\/buy\/.{1,}\/.{1,}\/.{1,}\/.{1,}\/?.*/.test(pathname)) buy();
    else if (/^\/classifieds\/relist\/.{1,}/.test(pathname)) buy();
    else if (/^\/classifieds\/sell\/.{1,}/.test(pathname)) sell();
    global();
}

module.exports = load;

//End classifieds.js
