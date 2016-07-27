//Begin refresh.js
var MenuActions = require('../menu-actions');
var Script = require('../script');

var refreshed = [],
    listings;

function addRefreshButtons() {
    $('.media.listing').filter(':has(.listing-intent-sell)').find('.listing-report').each(function () {
        $(this).parent().prepend(
                '<a class="btn btn-xs btn-bottom btn-primary listing-refreshbp" data-tip="top" title="" data-original-title="Refresh this user\'s backpack.">' +
                '<i class="fa fa-sw fa-refresh"></i>' +
                '</a>'
                );
    });

    listings = !!$('.listing-refreshbp').length;
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
    var accountId = refresh.closest('.media.listing').find('.media-object').find('li').data('listing_account_id');
    var steamId = Math.abs(accountId + 76561197960265728);
    return steamId
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

function addRallHeader() {
    var header = $('<span class="pull-right"><small><a href="#" id="header-refresh-all" style="color: #fff";">Refresh All</a></small></span>');
    header.find('#header-refresh-all').click(refreshAll);

    $('.panel-heading:contains(Sell Orders)').append(header);
}


function load() {
    addRefreshButtons();
    checkEscrowStuff();

    if (!listings) return;

    addButtonTooltips();
    addButtonListeners();
    if (location.pathname === '/classifieds' || location.pathname === '/classifieds/') addRallHeader();
    addMenuAction();
}

module.exports = load;


//End refresh.js
