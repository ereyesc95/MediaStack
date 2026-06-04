//Get values from fields and turn them into arrays
var arrLogos = $("#txtLogos").val().split(';');
var arrIcons = $("#txtIcons").val().split(';');
var arrPosters = $("#txtPosters").val().split(';');
var arrWalls = $("#txtWalls").val().split(';');
var arrPaths = $("#txtPaths").val().split(';');

var intCurrentIndex = 0;
var intCurrentLogoIndex = 0;
var intCurrentIconIndex = 0;
var currentColor = "rgba(0, 128, 128, 1)";
var strGlobReleaseName = "";
var strGlobCoveredArtist = "";
var strGlobActiveSection = "";
var strGlobActiveLyrics = "";
var strGlobLabel = "";
var strGlobCurrentEdition = "Standard Edition";
var strGlobCActiveEdition = "";
var strGlobalTracklist = "no"
var player = document.getElementById('player');
var progressBar = document.getElementById('progressAmount');
var progressBarBack = document.getElementById('progressAmountBack');
var strCurrentAudio = $("#player").attr("src").replaceAll(".lnk", "");
var strNewAudio = "";
var intVersionClickCheck = 0;
var intCheckPlaying = 0;
var strPlayStatus = 0;
var strTabClick = 0;
var strGlobActive = "Overview";
var strGlobActiveSimilar = "add";
var strAltDiscPath = "";
var strGlobIsPlaylist = "0";
var strGlobTrackClick = 0;
var strGlobShowDate = "";
var isPromoRelease = "false";

var prevTrack = document.getElementById('butPrevTrack');
var nextTrack = document.getElementById('butNextTrack');


$(".thLabel").css({ "text-shadow": "0 0 1px black" });
$(".linkText").css({ "text-shadow": "0 0 1px black", "font-weight": "bold" });


function hasThreeDotsInFirst12Chars(str) {
    // Ensure the string has at least 12 characters
    if (str.length < 12) return false;

    // Extract the first 12 characters
    let first12Chars = str.substring(0, 12);

    // Count occurrences of dots (`.`)
    let dotCount = (first12Chars.match(/\./g) || []).length;

    // Return true if at least 3 dots are found
    return dotCount >= 3;
}

//Get average color
$.ajax({
    type: "POST",
    async: false,
    url: "/Forms/SecondaryPage.aspx/GetProminentColor",
    data: JSON.stringify({
        'strPath': arrPaths[0] + arrWalls[0]
    }),
    contentType: "application/json; charset=utf-8",
    dataType: "json",
    success: function (data) {
        currentColor = data.d;
        $(".activeSec").css({
            "border-bottom": "1px solid " + currentColor,
            "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
        });

        $(".coloredText").css({ "color": currentColor });

        //Colorize images
        if (document.querySelectorAll('.colorImage').length > 0) {
            $('.colorImage').css({ "filter": "drop-shadow(0px 0px 5px " + currentColor + ")" });

        }
        if (document.querySelectorAll('.colorImageBorder').length > 0) {
            $('.colorImageBorder').css({ "border": "0.5px solid " + currentColor });

        }
    }
});

$(document).ready(function () {
    $('.content').removeClass('scrollableItemsDiv');
    if (typeof $("#imgLabel").attr("src") === 'undefined') {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/SecondaryPage.aspx/GetExtraData",
            data: JSON.stringify({
                'strCurColor': currentColor,
                'strGetSimilar': "true",
                "strRefresh": "false"
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                $(".coloredText").css({ "color": currentColor });
                var result = data.d;
                if (result != "") {
                    $("#divTopTracks").append(result.split("^")[0].replaceAll("%27", "'"));
                    $("#txtTopTrackPaths").val(result.split("^")[1]);
                    $("#divTopTracks").css({
                        "display": "block"
                    });

                    $('.imgTopTrack:first').addClass("firstTrack");
                    $('.imgTopTrack:last').addClass("lastTrack");

                    if (result.split("^")[2] != "non_modified_value") {
                        $("#divContentSimilar").empty();
                        $("#divContentSimilar").append(result.split("^")[2].replaceAll("%27", "'"));
                    }

                }
            }
        });
    }

    //Go to album page
    $(".imgTopTrack").click(function () {
        var strReleaseName = $(this).attr("data-value");
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
            data: JSON.stringify({
                'strSession1': strReleaseName,
                'strSession2': "curReleaseName",
                'strSession3': "",
                'strSession4': "",
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                //redirect to page 3
                var sessionVariables = data.d.split(";");
                setTimeout(function () {
                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strReleaseName.slice(12).replace('.', '·').replace("&", "¿"));

                }, 500);

            }
        });
    });

    //Clicking similar projects
    $(".simProject").click(function () {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
            data: JSON.stringify({
                'strSession1': $(this).text(),
                'strSession2': $(this).attr("data-code"),
                'strSession3': $(this).attr("data-id") + "_Link_Click",
                'strSession4': "",
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                var sessionVariables = data.d.split(";");
                setTimeout(function () {
                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                }, 300);

            }
        });
    });

    //If album page
    if (document.querySelectorAll('.colorImage').length > 0  && $("#imgLabel").attr("src") == "/Images/System/logo-main.png") {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/TertiaryPage.aspx/GetReleaseData",
            data: JSON.stringify({
                'strName': $("#txtRelease").val(),
                'strArtist': $("#txtArtistName").val(),
                'strArtistID': $("#txtArtistID").val(),
                'strProducer': $('#txtProducer').val()
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                var result = data.d;
                if (result != "" && result != "_playlist_") {
                    strGlobalTracklist = "no";
                    var varData = result.split('^')
                    $("#spaGen").html("<br><p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:18px'><a class='aSpaAlbum pSpaGenre' style='text-decoration: none'>" + varData[1] + "</a></p>");
                    if (varData[2] != "" && varData[2] != "Self-released record") {
                        strGlobLabel = "Yes";
                        $("#spaLabel").html("<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-top:5px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none'>Distributed by " + varData[2] + "</a></p>");
                        $("#imgLabel").attr('src', '/Images/Companies/' + varData[2] + '.png');
                        $("#imgLabel").css({ 'display': 'table' });
                        $("#spaProd").html(varData[3]);
                        var url = '/Images/Companies/' + varData[2] + '.png';
                        $(".coloredText").css({ "color": currentColor });
                        $(document).ready(function () {
                            $.ajax({
                                url: url,
                                type: 'HEAD',
                                success: function () {
                                    $("#imgLabel").css({ 'display': 'table' });
                                },
                                error: function () {
                                    $("#imgLabel").css({ 'display': 'none' });
                                }
                            });
                        });
                    }
                    else {
                        $("#spaLabel").html("<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-top:5px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none'>Self-released record</a></p>");
                        $("#imgLabel").attr('src', '/Images/Companies/Self-released record.png');
                        $("#imgLabel").css({ 'display': 'table' });
                        $("#spaProd").html(varData[3]);
                        $("#anchorProd").addClass("coloredText");
                        $(".coloredText").css({ "color": currentColor });
                        strGlobLabel = "No";
                    }
                    if (typeof varData[4] !== 'undefined') {
                        $("#txtWriters").val(varData[4].replaceAll('¿', ';'));
                    }
                }
                else if (result == "_playlist_")
                {
                    $('#divQR').css("display", "block");
                    $('#divCodes').css("display", "block");
                    $('#divExtraData').css("display", "block");
                    $('#divPlayer').css("display", "none");
                    strGlobIsPlaylist = "1";

                    $("#menuItem1").click();
                    strGlobalTracklist = "yes";
                }
            }
        });
    }
});

//Play track
$(".divSubContentSpan").click(function () {
    $(".imgTopTrack").removeClass("activeTrack");
    $(".imgTopTrack").css({ "border": "0px solid transparent" });
    $(this).siblings(".imgTopTrack").addClass("activeTrack");
    var strValue = $(this).children(".aTopTrack").attr("data-path");
    strPlaying = 1;
    $("#player").attr("src", strValue);
    $(".aPause").css({ 'display': 'block' });
    $(".aPlay").css({ 'display': 'none' });
    document.getElementById('player').play();
    //add color frame to picture
    $(".activeTrack").css({ "border": "1px solid " + currentColor });
    $(".hp_range").css({ "background-color": currentColor });
});

//Update top icon-logos
//$(".imgSwipeButtons").on("click", function () {
//    if ($('#iconTop').attr("src") != "") {
//        $("#iconTop").css({ 'display': 'inline' , 'width' : '50px'});
//    }
//    else {
//        $("#iconTop").css({ 'display': 'none' });
//    }
//    if ($('#logoTop').attr("src") != "") {
//        $("#logoTop").css({ 'display': 'inline' });
//    }
//    else {
//        $("#logoTop").css({ 'display': 'none' });
//    }

//})

//Left button
$("#imgLeftButton").on("click", function () {
    if (typeof arrPosters[intCurrentIndex + 1] === 'undefined') {
        intCurrentIndex = 0;
        $("#divContainerLeft").css({ "background-image": "url('" + arrPaths[0] + arrPosters[intCurrentIndex] + "')", "transition": "all 0.2s linear" });
        $('#divContainerLeft').attr("title", $("#imgTitle").val() + ", " + arrPosters[intCurrentIndex].substring(0, 4));
        $(".imgSwipeButtons").attr("title", $("#imgTitle").val() + ", " + arrPosters[intCurrentIndex].substring(0, 4));
        $("#bodySecondPage").css({ "background-image": "url('" + arrPaths[0] + arrWalls[intCurrentIndex] + "')" });
    }
    else {
        intCurrentIndex = intCurrentIndex + 1;
        $("#divContainerLeft").css({ "background-image": "url('" + arrPaths[0] + arrPosters[intCurrentIndex] + "')", "transition": "all 0.2s linear" });
        $('#divContainerLeft').attr("title", $("#imgTitle").val() + ", " + arrPosters[intCurrentIndex].substring(0, 4));
        $(".imgSwipeButtons").attr("title", $("#imgTitle").val() + ", " + arrPosters[intCurrentIndex].substring(0, 4));
        $("#bodySecondPage").css({ "background-image": "url('" + arrPaths[0] + arrWalls[intCurrentIndex] + "')" });
    }

    //Set appropriate icons

    for (var i = 0; i < arrIcons.length; ++i) {
        //More than one period of time
        if (arrIcons[i].indexOf(",") >= 0) {
            var arrPeriod = arrIcons[i].split(',');
            for (var j = 0; j < arrPeriod.length; ++j) {
                var arrDates = arrPeriod[i].substring(arrPeriod[i].indexOf("[") + 1, arrPeriod[i].lastIndexOf("]")).split('-');
                if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1])) {
                    $("#iconTop").attr("src", arrPaths[1] + arrPeriod[i]);
                    $("#iconTop").css({ 'display': 'inline', 'width': '50px' });
                    break;
                }
                else {
                    $("#iconTop").attr("src", "");
                    $("#iconTop").css({ 'display': 'none'});
                }
            }
        }
        //Only one period of time
        else {
            var arrDates = arrIcons[i].substring(arrIcons[i].indexOf("[") + 1, arrIcons[i].lastIndexOf("]")).split('-');
            if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1])) {
                $("#iconTop").attr("src", arrPaths[1] + arrIcons[i]);
                $("#iconTop").css({ 'display': 'inline', 'width': '50px' });
                break;
            }
            else {
                $("#iconTop").attr("src", "");
                $("#iconTop").css({ 'display': 'none' });
            }
        }

    }

    //Set appropriate logos
    for (var i = 0; i < arrLogos.length; ++i) {

        //More than one period of time
        if (arrLogos[i].indexOf(",") >= 0) {
            var arrPeriod = arrLogos[i].split(',');
            for (var j = 0; j < arrPeriod.length; ++j) {
                var arrDates = arrPeriod[i].substring(arrPeriod[i].indexOf("[") + 1, arrPeriod[i].lastIndexOf("]")).split('-');
                if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1])) {
                    $("#logoTop").attr("src", arrPaths[1] + arrPeriod[i]);
                    break;
                }
            }
        }

        else {
            var arrDates = arrLogos[i].substring(arrLogos[i].indexOf("[") + 1, arrLogos[i].lastIndexOf("]")).split('-');
            if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1])) {
                $("#logoTop").attr("src", arrPaths[1] + arrLogos[i]);
                break;
            }
        }
    }

    //Get average color
    if (typeof $("#imgLabel").attr("src") === 'undefined') {

        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/SecondaryPage.aspx/GetProminentColor",
            data: JSON.stringify({
                'strPath': arrPaths[0] + arrWalls[intCurrentIndex]
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                currentColor = data.d;
                $(".activeSec").css({
                    "border-bottom": "1px solid " + currentColor,
                    "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
                });
                $(".coloredText").css({ "color": currentColor });
                $(".activeTrack").css({ "border": "1px solid " + currentColor });
                $(".hp_range").css({ "background-color": currentColor });
            }
        });
    }
});

//Right button
$("#imgRightButton").on("click", function () {
    if (typeof arrPosters[intCurrentIndex - 1] === 'undefined') {
        intCurrentIndex = arrPosters.length - 1;
        $("#divContainerLeft").css({ "background-image": "url('" + arrPaths[0] + arrPosters[intCurrentIndex] + "')", "transition": "all 0.2s linear" });
        $(".imgSwipeButtons").attr("title", $("#imgTitle").val() + ", " + arrPosters[intCurrentIndex].substring(0, 4));
        $("#bodySecondPage").css({ "background-image": "url('" + arrPaths[0] + arrWalls[intCurrentIndex] + "')" });
    }
    else {
        intCurrentIndex = intCurrentIndex - 1;
        $("#divContainerLeft").css({ "background-image": "url('" + arrPaths[0] + arrPosters[intCurrentIndex] + "')", "transition": "all 0.2s linear" });
        $(".imgSwipeButtons").attr("title", $("#imgTitle").val() + ", " + arrPosters[intCurrentIndex].substring(0, 4));
        $("#bodySecondPage").css({ "background-image": "url('" + arrPaths[0] + arrWalls[intCurrentIndex] + "')" });
    }

    //Set appropriate icons
    for (var i = 0; i < arrIcons.length; ++i) {
        //More than one period of time
        if (arrIcons[i].indexOf(",") >= 0) {
            var arrPeriod = arrIcons[i].split(',');
            for (var j = 0; j < arrPeriod.length; ++j) {
                var arrDates = arrPeriod[i].substring(arrPeriod[i].indexOf("[") + 1, arrPeriod[i].lastIndexOf("]")).split('-');
                if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1])) {
                    $("#artistNameTop").css({ 'display': 'none' });
                    $("#iconTop").attr("src", arrPaths[1] + arrPeriod[i]);
                    $("#iconTop").css({ 'display': 'inline', 'width': '50px' });
                    break;
                }
                else {
                    $("#artistNameTop").css({ 'display': 'none' });
                    $("#iconTop").attr("src", "");
                    $("#iconTop").css({ 'display': 'none' });
                }
            }
        }
        else {
            var arrDates = arrIcons[i].substring(arrIcons[i].indexOf("[") + 1, arrIcons[i].lastIndexOf("]")).split('-');
            if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1])) {
                $("#artistNameTop").css({ 'display': 'none' });
                $("#iconTop").attr("src", arrPaths[1] + arrIcons[i]);
                $("#iconTop").css({ 'display': 'inline', 'width': '50px' });
                break;
            }
            else {
                $("#artistNameTop").css({ 'display': 'none' });
                $("#iconTop").attr("src", "");
                $("#iconTop").css({ 'display': 'none' });
            }
        }
    }

    //Set appropriate logos
    for (var i = 0; i < arrLogos.length; ++i) {
        //More than one period of time
        if (arrLogos[i].indexOf(",") >= 0) {
            var arrPeriod = arrLogos[i].split(',');
            for (var j = 0; j < arrPeriod.length; ++j) {
                var arrDates = arrPeriod[i].substring(arrPeriod[i].indexOf("[") + 1, arrPeriod[i].lastIndexOf("]")).split('-');
                if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1]))
                {
                    $("#artistNameTop").css({ 'display': 'none' });
                    $("#logoTop").attr("src", arrPaths[1] + arrPeriod[i]);
                    $("#logoTop").css({ 'display': 'inline' });
                    break;
                }
                else {
                    $("#logoTop").attr("src", "");
                    $("#logoTop").css({ 'display': 'none' });
                    $("#artistNameTop").css({ 'display': 'inline', 'width': '50px' });
                }
            }
        }
        else {
            var arrDates = arrLogos[i].substring(arrLogos[i].indexOf("[") + 1, arrLogos[i].lastIndexOf("]")).split('-');
            if (parseInt(arrPosters[intCurrentIndex].substring(0, 4)) >= parseInt(arrDates[0]) && parseInt(arrPosters[intCurrentIndex].substring(0, 4)) <= parseInt(arrDates[1]))
            {
                $("#artistNameTop").css({ 'display': 'none' });
                $("#logoTop").attr("src", arrPaths[1] + arrLogos[i]);
                $("#logoTop").css({ 'display': 'inline'});
                break;
            }
            else {
                $("#logoTop").attr("src", "");
                $("#logoTop").css({ 'display': 'none' });
                $("#artistNameTop").css({ 'display': 'inline', 'width': '50px' });
            }
        }
    }

    //Get average color
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/SecondaryPage.aspx/GetProminentColor",
        data: JSON.stringify({
            'strPath': arrPaths[0] + arrWalls[intCurrentIndex]
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            currentColor = data.d;
            $(".activeSec").css({
                "border-bottom": "1px solid " + currentColor,
                "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
            });
            $(".coloredText").css({ "color": currentColor });
            $(".activeTrack").css({ "border": "1px solid " + currentColor });
            $(".hp_range").css({ "background-color": currentColor });
        }
    });
});

$('.trackRow').on("mouseover", function () {
    $(this).css({ "padding-right": "-15px" });
    $(this).children(".controlWrapper").children(".controlTrack").css({ "display": "block" });
    $(this).children(".controlWrapper").children(".numberTrack").css({ "display": "none" });

    if (!$(this).hasClass("activeTer")) {
        $(this).css({
            "border-bottom": "1px solid " + currentColor,
            "border-top": "1px solid " + currentColor,
            "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
            "background-color": "rgba(0, 0, 0, 0.5)"
        });
    }

});

$('.trackRow').on("mouseleave", function () {
    $(this).css({ "padding-right": "15px" });
    $(this).children(".controlWrapper").children(".controlTrack").css({ "display": "none" });
    $(this).children(".controlWrapper").children(".numberTrack").css({ "display": "block" });

    if (!$(this).hasClass("activeTer")) {
        $(this).css({
            "background-color": "rgba(0, 0, 0, 0)",
            "border-bottom": "0",
            "border-top": "0",
            "text-shadow": "0 0"
        });
    }
});


$('.trackRow').on("click", function () {
    if ($(this).hasClass("promoMaterialRow")) {
        isPromoRelease = "Promo Release";
    }
    $(".trackRow").removeClass("selectedTrack");
    $(".trackRowVersion").removeClass("selectedTrack");
    strCurrentAudio = $(this).attr("data-webpath").replaceAll(".lnk", "");
    if (strTabClick == 1 && strGlobTrackClick == 0) {
        strTabClick = 0;
        strGlobTrackClick == 1;
    }
    if (strTabClick != 1) {
        $(".aPlay").click();
    }
    else {
        strTabClick = 0;
    }
    intVersionClickCheck = 0;
    $(this).addClass("selectedTrack");

    strGlobActiveSection = "";
    if (currentColor != "") { //if (!$(this).hasClass("activeMainTrack")) {
        if (strGlobLabel == "No") {
            $("#divTrackDetails").css({ "margin-top": "-150px" });
        }
        else if (strGlobalTracklist == "no" && $(this).attr("data-webpath").includes('/Various Artists/')) {
            $("#divTrackDetails").css({ "margin-top": "-185px" });
        }
        else if(strGlobalTracklist == "no") {
            $("#divTrackDetails").css({ "margin-top": "-205px" });
        }
        else {
            $("#divTrackDetails").css({ "margin-top": "-20px" });
        }

        $(".trackRow").removeClass("activeMainTrack");
        $(this).addClass("activeMainTrack");


        $('.trackRow').css({
            "background-color": "rgba(0, 0, 0, 0)",
            "border-bottom": "0",
            "border-top": "0",
            "text-shadow": "0 0"
        });

        if (!$(this).hasClass("activeTer")) {
            $(this).css({
                "border-bottom": "1px solid " + currentColor,
                "border-top": "1px solid " + currentColor,
                "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                "background-color": "rgba(0, 0, 0, 0.5)"
            });
        }

        $('.trackRow').removeClass("activeTer");
        $(this).addClass("activeTer");

        //Variable Definition
        var strReleaseType = $(".pSpaType").text().replaceAll(" by ", "");
        var strWebPath = $(this).attr("data-webpath");
        let pathSegments = strWebPath.split("/");
        let pathFolderName = pathSegments[8];
        let pathSubFolderName = pathSegments[9];
        let releaseTitle = typeof pathFolderName != 'undefined' && pathFolderName.length > 12 ? pathFolderName.substring(12) : pathFolderName;
        let subReleaseTitle = typeof pathSubFolderName != 'undefined' && pathSubFolderName.length > 12 ? pathSubFolderName.substring(12) : typeof pathSubFolderName != 'undefined'? pathSubFolderName : "";
        let originalReleaseType = typeof pathFolderName != 'undefined' ? pathSegments[7].slice(0, -1) : strReleaseType;
        var strFullName = $(this).attr("data-fullname");
        var strFeatures = $(this).attr("data-feat");
        var strTrackType = $(this).attr("data-tracktype");
        var strCovers = $(this).attr("data-cover");
        var strOtherData = $(this).attr("data-other");
        var strEdition = $(this).attr("data-edition");
        var strEditionDate = $(this).attr("data-editionDate");
        var strDiscFullName = $(this).attr("data-disc");
        var strSinglesPath = $("#txtSinglesPath").val();
        strAltDiscPath = "";
        strGlobCurrentEdition = $(this).attr("data-edition");
        var strOriginalArtist = typeof $(this).attr("data-performingArtist") != 'undefined' ? $(this).attr("data-performingArtist") : "";
        var strWritingCredits = $("#txtWriters").val() != "" ? $("#txtWriters").val() : typeof $(this).attr("data-writer") != 'undefined' ? $(this).attr("data-writer") : "";
        var strBSide = $(this).attr("data-singlecontainer") ?.replaceAll("%27", "\'");
        var strTourTitle = typeof $(this).attr("data-tour") != 'undefined' ? $(this).attr("data-tour") : "";

        //If it's a video of a series
        if (strFeatures == "series_row") {
            window.open(strWebPath, "_blank");
        }
        else {
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/TertiaryPage.aspx/TrackClick",
                data: JSON.stringify({
                    'strWebPath': strWebPath,
                    'strFullName': strFullName,
                    'strFeatures': strFeatures,
                    'strTrackType': strTrackType,
                    'strCovers': strCovers,
                    'strOtherData': strOtherData,
                    'strEdition': strEdition,
                    'strEditionDate': strEditionDate,
                    'strDiscFullName': strDiscFullName,
                    'strSinglesPath': strSinglesPath,
                    'strVersion': "",
                    'strOriginalArtist': strOriginalArtist,
                    'strWritingCredits': strWritingCredits,
                    'strPlaylist' : strGlobIsPlaylist
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    var strData = data.d.split(";");
                    if (strData[strData.length - 1].includes('Canvas')) {
                        if ($("#canvasSource").attr("src") != strData[strData.length - 1]) {
                            $("#canvasSource").attr("src", strData[strData.length - 1]);
                            $("#vidCanvas")[0].load();
                        }
                        strData.pop();
                    }
                    else {
                        $("#canvasSource").attr("src", "");
                        $("#vidCanvas")[0].load();
                    }
                    if (strData[strData.length - 1].includes('non_available')) {
                        $("#canvasSource").attr("src", "");
                        $("#vidCanvas")[0].load();
                        strData.pop();
                    }
                    if (strData[strData.length - 1].includes('AltDiscPath_')) {
                        strAltDiscPath = strData[strData.length - 1].replaceAll("AltDiscPath_", "");
                        strData.pop();
                    }
                    if (strData[strData.length - 2].includes('AltDiscPath_')) {
                        strAltDiscPath = strData[strData.length - 2].replaceAll("AltDiscPath_", "");
                        strData.splice(strData.length - 2, 1);
                    }

                    $("#imgCover").attr("src", strData[0]);
                    $("#imgDisc").attr("src", strData[1]);
                    $("#imgAltDisc").attr("src", strAltDiscPath);

                    if ($("#vidSource").attr("src") != strData[3] || strData[0].includes("05. Singles [Music]")) {
                        if (!strData[0].includes("05. Singles [Music]")) {
                            $("#vidSource").attr("src", strData[3]);
                        }
                        else {
                            $("#vidSource").attr("src", "");
                        }
                        $("#vidCover")[0].load();
                    }
                    
                    var strReleaseName = strData[4];
                    var strTraDate = strData[5];
                    var strYouTubeLink = strData[7];
                    var strNewArtistID = typeof strData[8] != 'undefined' ? strData[8] : "";
                    var strOriginalArtist = typeof strData[9] != 'undefined' ? strData[9] : "";
                    var strWriters = typeof strData[10] != 'undefined' ? strData[10] : "";
                    var strWritersPlain = typeof strData[11] != 'undefined' ? strData[11] : "";
                    var strWritersFullField = typeof strData[12] != 'undefined' ? strData[12] : "";

                    $('body').css('background-image', 'url("' + strData[2].replaceAll("\\","/") + '")');

                    $.ajax({
                        type: "POST",
                        async: false,
                        url: "/Forms/SecondaryPage.aspx/GetProminentColor",
                        data: JSON.stringify({
                            'strPath': strData[2]
                        }),
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        success: function (data) {
                            currentColor = data.d;
                            $(".activeSec").css({
                                "border-bottom": "1px solid " + currentColor,
                                "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
                            });
                            $(".coloredText").css({ "color": currentColor });
                            $('.colorImage').css({ "filter": "drop-shadow(0px 0px 5px " + currentColor + ")" });

                            $(".activeTer").css({
                                "border-bottom": "1px solid " + currentColor,
                                "border-top": "1px solid " + currentColor,
                                "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                                "background-color": "rgba(0, 0, 0, 0.5)"
                            });

                            if (strOriginalArtist != "") {
                                strFullName = strFullName.replace("Performed by " + strOriginalArtist, "").replace(" by " + strOriginalArtist, "");
                            }
                            if (strFullName.includes(".mp4"))
                            {
                                var datePrefixRegex = /^\d{4}\.\d{2}\.\d{2}\./;
                                var startsWithDatePrefix = datePrefixRegex.test(strFullName);
                                if (startsWithDatePrefix) {
                                    strFullName = strFullName.substring(8);
                                }
                                
                                strFullName = strFullName.replace(strFeatures, "").replace(strCovers, "").replace(";", "").replace(" []", "").replace(" [ ", " [").replace(" language version", " version");
                            }
                            else {
                                strFullName = strFullName.replace(strFeatures, "").replace(strCovers, "").replace(";", "").replace(" []", "").replace(" [ ", " [").replace(" language version", " version");
                            }
                            
                            strFullName = strFullName.replace("[; ", "[");
                            var strBracketContent = "";
                            if (strFullName.indexOf("[") > 0) {
                                strBracketContent = strFullName.substring(strFullName.indexOf("[") + 1, strFullName.lastIndexOf("]"));
                            }

                            strBracketContent = strBracketContent != "" ? strBracketContent.replaceAll("%27", "\'").replaceAll("Performed by " + strOriginalArtist, "") : strOtherData.replace("Performed by " + strOriginalArtist, "");
                            strFullName = strFullName.slice(4).substring(0, strFullName.length - 8).replaceAll("%27", "'").replaceAll("[", "(").replaceAll("]", ")");
                            strFullName = strFullName.replaceAll("Performed by" + strOriginalArtist, "").replaceAll(" ()", "");
                            strBracketContent = strBracketContent.replaceAll("Performed by" + strOriginalArtist, "").replaceAll(" ()", "");

                            if (strOriginalArtist != "" && strFullName.includes(" (by " + strOriginalArtist + ")")) {
                                strFullName = strFullName.replaceAll(" (by " + strOriginalArtist + ")", "");
                                strBracketContent = strBracketContent.replaceAll("by " + strOriginalArtist, "");
                                strFullName = strBracketContent != "" ? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";
                            }
                            else if (strOriginalArtist != "" && strBracketContent != "" && (strBracketContent.includes(" by ") || strBracketContent.includes("by ")))
                            {
                                strBracketContent = strBracketContent.replaceAll(" by " + strOriginalArtist + "").replaceAll("by " + strOriginalArtist + "");
                                strFullName = typeof strBracketContent != "undefined" && strBracketContent != "" && strBracketContent != "undefined"? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";
                            }
                            else {
                                strFullName = strBracketContent != "" ? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";
                            }
                            

                            //Original artist
                            if (strOriginalArtist != "") {
                                //If it has tour
                                if (strTourTitle != "") {
                                    strOriginalArtist = "<span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strTourTitle + "</span>"
                                }
                                else {
                                    strOriginalArtist = "<span>Performed by </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strOriginalArtist + "</span>"
                                }
                            }

                            //>2 features
                            if (strFeatures != "" && strFeatures.indexOf(" & ") > 0 && strFeatures.indexOf(",") > 0) {

                                var strFeatureArray = strFeatures.split(',');
                                for (var i = 0; i < strFeatureArray.length; ++i) {

                                    if (i == 0) {
                                        strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[i].replace("feat. ", "") + "</span>";
                                    }

                                    else if (strFeatureArray[i] != "" && strFeatureArray[i].indexOf(" & ") > 0) {
                                        var strFeatureArray2 = strFeatureArray[i].split('&');
                                        strFeatures = strFeatures + "<span>, </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray2[0] + "</span>" +
                                            "<span>& </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray2[1] + "</span>" + "<br>";
                                    }

                                    else {
                                        strFeatures = strFeatures + "<span>, </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[i] + "</span>";
                                    }
                                }
                            }

                            //2 features
                            else if (strFeatures != "" && strFeatures.indexOf(" & ") > 0) {
                                var strFeatureArray = strFeatures.split('&');
                                strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[0].replace("feat. ", "") + "</span>" +
                                    "<span>and </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[1] + "</span>" + "<br>";
                            }

                            //1 feature
                            else if (strFeatures != "") {
                                strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatures.replace("feat. ", "") + "</span><br>";
                            }

                            strEdition = strEdition != "" ? strEdition : strData[6].replaceAll(",", ";");
                            strEdition = typeof strEdition != "undefined" ? strEdition : "";

                            if (strEdition == "" && strDiscFullName != "") {
                                var strContent = strData[1].replace("//[Artwork]/" + strDiscFullName + ".png", "").replace("http://127.0.0.1:8887/", "");
                                var strContentArray = strContent.split('/');

                                var strCurRelease = strContentArray[4];
                                var strCurEdition = typeof strContentArray[5] != "undefined" && strContentArray[5].indexOf(" Edition") >= 0 ? strContentArray[5].substring(12) : "";
                                strEdition = strCurRelease;
                                if (strDiscFullName.indexOf("Disc ") >= 0) {
                                    strDiscFullName = strCurEdition != "" ? strCurEdition + ", " + strDiscFullName : strDiscFullName;
                                }
                                else {
                                    strDiscFullName = strCurEdition.replace("Standard Edition", "");
                                }

                                if (strDiscFullName != "" && strDiscFullName.match("^0")) {
                                    // do this if begins with Hello
                                    strDiscFullName = strDiscFullName.slice(4);
                                }
                                if (typeof strEdition != "undefined" && strEdition != "Albums" && strEdition != "Compilations" && strEdition != "Singles" && strReleaseType != "Compilation" && strEdition != "Live Records") {
                                    strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span><span>, " + strDiscFullName + "</span>" : strEdition != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                    $("#traRelease").html(strEdition);
                                }
                                else if (strReleaseType == "Compilation" && typeof strEdition !== "undefined") {
                                    if (originalReleaseType != "Compilation") {
                                        strEdition = "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + releaseTitle + "</span>";
                                        $("#traRelease").html(strEdition);
                                    }
                                    else if (typeof strEdition !== "undefined") {
                                        //strEdition = "<span>Previously Unreleased</span>";
                                        $("#traRelease").html("");
                                    }
                                    else {
                                        $("#traRelease").html("");
                                    }
                                }
                                else if (typeof strEdition == "undefined") {
                                    $("#traRelease").html("");
                                }
                                else if (typeof strEdition != "undefined" && strEdition == "Albums") {
                                    $("#traRelease").html("");
                                }
                            }

                            else if (strEdition == "" && strDiscFullName == "" && strData[1] != null && strData[1].indexOf(".png") == -1) {
                                var strContent = strData[1].replace("//[Artwork]/Disc.png", "").replace("http://127.0.0.1:8887/", "");
                                var strContentArray = strContent.split('/');

                                var strCurRelease = strContentArray[4];
                                var strCurEdition = typeof strContentArray[5] != "undefined" && strContentArray[5].indexOf(" Edition") >= 0 ? strContentArray[5].substring(12) : "";
                                strEdition = strCurRelease;
                                strDiscFullName = strCurEdition.replace("Standard Edition", "");

                                strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span><span>, " + strDiscFullName + "</span>" : strEdition != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                $("#traRelease").html(strEdition);
                            }
                            else if (typeof strBSide != "undefined" && strBSide!= ""){
                                strEdition = "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strBSide + "</span>";
                                $("#traRelease").html(strEdition);
                            }

                            else {
                                var intDiscIndex = 4
                                if (strDiscFullName.substring(0, 1) == ".") {
                                    intDiscIndex = 8
                                }
                                else if (strReleaseType == "Compilation" && typeof strEdition !== "undefined") {
                                    var sourceReleaseTitle = originalReleaseType == "Single" ? subReleaseTitle : releaseTitle;
                                    if (originalReleaseType != "Compilation") {
                                        strEdition = "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + sourceReleaseTitle + "</span>";
                                        $("#traRelease").html(strEdition);
                                    }
                                    else if (typeof strEdition !== "undefined") {
                                        //strEdition = "<span>Previously Unreleased</span>";
                                        $("#traRelease").html("");
                                    }
                                    else {
                                        $("#traRelease").html("");
                                    }
                                }
                                else if (strNewArtistID != "" && strGlobIsPlaylist == "1") {
                                    strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" + "<span>, " + strDiscFullName.substring(intDiscIndex) + "</span>"
                                        : strEdition.indexOf(".mp3 ") > 0 ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(intDiscIndex).replaceAll(".mp3", "").replaceAll(";", "").replaceAll(strBracketContent, "").replaceAll(" []", "") + "</span>"
                                            : strEdition != "" && strEdition.indexOf("[") == -1 ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                    $("#traRelease").html(strEdition);
                                }
                                else {
                                    strEdition = strDiscFullName != "" ? "Taken from: " + strEdition.substring(12) + ", " + strDiscFullName.substring(intDiscIndex) : strEdition.indexOf(".mp3 ") > 0 ? "Taken from: " + strEdition.substring(intDiscIndex).replaceAll(".mp3", "").replaceAll(";", "").replaceAll(strBracketContent, "").replaceAll(" []", "") : strEdition != "" && strEdition.indexOf("[") == -1 ? "Taken from: " + strEdition.substring(12) : "";
                                    $("#traRelease").text(strEdition);
                                }
                            }

                            //strTraDate = strGlobalTracklist == "no" ? "Released on " + strTraDate : "";
                            strTraDate = "Released on " + strTraDate;
                            strGlobCoveredArtist = strCovers.replace(" cover", "").replace(/^\s+/, '');
                            strCovers = strCovers != "" ? "<span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strCovers.replace(" cover", "").replace(/^\s+/, '') + "</span><span> cover</span><br>" : "";
                            strFullName = strFullName.replaceAll(";)<", ")<");
                            $("#traTitle").html(strFullName);
                            strGlobReleaseName = strFullName;
                            $("#traOriginal").html(strOriginalArtist);
                            $("#traWriters").html(strWriters.replaceAll("¿", ";").replaceAll("current_color", "aliceblue"));
                            $("#txtWriterField").val(strWritersPlain);
                            $("#txtWriters").val(strWritersFullField.replaceAll('¿', ';'));
                            $("#traFeat").html(strFeatures);

                            $("#traDate").text(strTraDate);
                            $("#traCover").html(strCovers);

                            $('#divTrackButtons').css("visibility", "visible");
                            $('.butReturnTracklist').css("display", "none");

                            //Toggle youtube video button
                            if (strYouTubeLink != "") {
                                $('#divVideos').css("visibility", "visible");
                                $("#divTrackButtons").css({ "margin-left": "87px" });
                                $("#butVideos").attr("href", strYouTubeLink.replace("/watch?v=", "/embed/") + "?fs=1&autoplay=1");
                            }
                            else {
                                $('#divVideos').css("visibility", "hidden");
                                $("#divTrackButtons").css({ "margin-left": "140px" });
                            }



                            //Check for featured artists/covered

                            $('.artistRef').on("click", function () {
                                var strArtistName = ($(this).text());

                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/TertiaryPage.aspx/ArtistLookup",
                                    data: JSON.stringify({
                                        'strArtistName': strArtistName
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {
                                        //If folder is found, then redirect
                                        if (data.d.indexOf("https://") == -1) {
                                            setTimeout(function () {
                                                window.location.replace("/Media/Music/" + data.d);
                                            }, 300);
                                        }

                                        //if not found look into wikipedia/google
                                        else {
                                            window.open(data.d, "_blank");
                                        }
                                    }
                                })
                            })

                            $(".aAlbumPageAnchor").click(function () {
                                var strNewArtistID = typeof $(this).attr("data-newartist") != 'undefined' ? $(this).attr("data-newartist") : "";
                                var strValue = $(this).text();
                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                    data: JSON.stringify({
                                        'strSession1': strNewArtistID,
                                        'strSession2': "Return",
                                        'strSession3': "",
                                        'strSession4': strGlobIsPlaylist,
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {
                                        var sessionVariables = data.d.split(";");
                                        setTimeout(function () {
                                            window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
                                        }, 300);
                                    }
                                });
                            });
                            //Click on writer to redirect
                            $(".spaWriterName").click(function () {
                                var strNewArtistID = $(this).text();
                                var strValue = $(this).attr("data-href");
                                if (strValue.indexOf("https://") == -1) {
                                    $.ajax({
                                        type: "POST",
                                        async: false,
                                        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                        data: JSON.stringify({
                                            'strSession1': strNewArtistID,
                                            'strSession2': "bands",
                                            'strSession3': "",
                                            'strSession4': "",
                                        }),
                                        contentType: "application/json; charset=utf-8",
                                        dataType: "json",
                                        success: function (data) {
                                            var sessionVariables = data.d.split(";");
                                            setTimeout(function () {
                                                window.location.replace("/Media/Music/" + strValue.replace("&", "¿"));
                                            }, 300);

                                        }
                                    });
                                }
                                else {
                                    window.open(strValue, "_blank");
                                }
                            });

                            //Writer label click
                            $(".spaWriterLabel").click(function () {
                                $("#traWriters").css({ 'display': 'none' });
                                $("#txtWriterField").css({ 'display': 'block' });
                            });
                        }
                    });
                }
            });
        }
    }
    $(".hp_range").css({ "background": currentColor });
    var rgbacolor = hexToRgb(currentColor);
    $(".hp_slide").css({ "background": "rgba(" + rgbacolor + ", 0.3)" });
});

$('#imgCover').on("click", function () {
    if (strAltDiscPath != "") {
        $("#imgCover").css("visibility", "hidden");
        $("#vidCover").css("visibility", "hidden");
        $("#imgAltDisc").css("visibility", "visible");
    }
})

$('#vidCover').on("click", function () {
    if (strAltDiscPath != "") {
        $("#imgCover").css("visibility", "hidden");
        $("#vidCover").css("visibility", "hidden")
        $("#imgAltDisc").css("visibility", "visible");
    }
})

$('#imgAltDisc').on("click", function () {
    if (strAltDiscPath != "") {
        $("#imgCover").css("visibility", "visible");
        $("#vidCover").css("visibility", "visible");
        $("#imgAltDisc").css("visibility", "hidden");
    }
})

// Return to tracklist
$('.butReturnTracklist').on("click", function () {
    //Click on first trackRowVersion item

    $("#divContainerLyrics").html("");

    $('.trackRowVersion:first').removeClass("firstTrackRowVersion");
    $('.trackRowVersion:last').removeClass("lastTrackRowVersion");


    if (strGlobActiveSection == "Versions" && strGlobActiveLyrics == "Yes") {
        $('#divContainerVersions').css("visibility", "visible");
        $('#divContainerTracks').css("visibility", "hidden");
        $('.butReturnTracklist').css("display", "none");
        $('#butReturnTracklistVer').css("display", "block");
        strGlobActiveSection = "";
        strGlobActiveLyrics = "";
    }
    else {
        $(".activeMainTrack").click();
        $("#divContainerVersions").html("");
        $('#divContainerTracks').css("visibility", "visible");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#butVersions').css("display", "block");
        $('.butReturnTracklist').css("display", "none");
    }

    $('#divContainerLyrics').css("visibility", "hidden");
    $('#butLyrics').css("display", "block");


})

// Check for versions
$('#butVersions').on("click", function () {
    strGlobActiveSection = "Versions";
    var strTrackTitle = strGlobReleaseName;
    var strOriginalArtist = strGlobCoveredArtist;

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/TertiaryPage.aspx/TrackVersions",
        data: JSON.stringify({
            'strTrackTitle': strTrackTitle,
            'strColor': currentColor,
            'strOriginalArtist': strOriginalArtist,
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            $("#divContainerVersions").html(data.d);
            $('#divContainerTracks').css("visibility", "hidden");
            $('#divContainerVersions').css("visibility", "visible");
            $('#divContainerLyrics').css("visibility", "hidden");

            $('#butVersions').css("display", "none");
            $('#butReturnTracklistVer').css("display", "block");


            $('.trackRowVersion').on("mouseover", function () {
                $(this).css({ "padding-right": "-15px" });
                $(this).children(".controlWrapper").children(".controlTrack").css({ "display": "block" });
                $(this).children(".controlWrapper").children(".numberTrack").css({ "display": "none" });

                if (!$(this).hasClass("activeTer")) {
                    $(this).css({
                        "border-bottom": "1px solid " + currentColor,
                        "border-top": "1px solid " + currentColor,
                        "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                        "background-color": "rgba(0, 0, 0, 0.5)"
                    });
                }

            });

            $('.trackRowVersion').on("mouseleave", function () {
                $(this).css({ "padding-right": "15px" });
                $(this).children(".controlWrapper").children(".controlTrack").css({ "display": "none" });
                $(this).children(".controlWrapper").children(".numberTrack").css({ "display": "block" });

                if (!$(this).hasClass("activeTer")) {
                    $(this).css({
                        "background-color": "rgba(0, 0, 0, 0)",
                        "border-bottom": "0",
                        "border-top": "0",
                        "text-shadow": "0 0"
                    });
                }
            });

            $('.trackRowVersion').on("click", function () {

                $(".trackRow").removeClass("selectedTrack");
                $(".trackRowVersion").removeClass("selectedTrack");
                intVersionClickCheck = 1;
                strCurrentAudio = $(this).attr("data-webpath").replaceAll(".lnk", "");
                if (strTabClick != 1) {
                    $(".aPlay").click();
                }
                else {
                    strTabClick = 0;
                }
                $(this).addClass("selectedTrack");
                strGlobActiveSection = "Versions";
                $('.trackRowVersion').css({
                    "background-color": "rgba(0, 0, 0, 0)",
                    "border-bottom": "0",
                    "border-top": "0",
                    "text-shadow": "0 0"
                });

                if (!$(this).hasClass("activeTer")) {
                    $(this).css({
                        "border-bottom": "1px solid " + currentColor,
                        "border-top": "1px solid " + currentColor,
                        "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                        "background-color": "rgba(0, 0, 0, 0.5)"
                    });
                }

                $('.trackRowVersion').removeClass("activeTer");
                $(this).addClass("activeTer");

                //Variable Definition
                var strWebPath = $(this).attr("data-webpath");
                var strFullName = $(this).attr("data-fullname");
                var strFeatures = $(this).attr("data-feat");
                var strTrackType = $(this).attr("data-tracktype");
                var strCovers = $(this).attr("data-cover");
                var strOtherData = $(this).attr("data-other");
                var strEdition = $(this).attr("data-edition");
                var strEditionDate = $(this).attr("data-editionDate");
                var strDiscFullName = $(this).attr("data-disc");
                var strTrackNumber = $(this).attr("data-tracknumber");
                var strSinglesPath = $("#txtSinglesPath").val();
                var strOriginalArtist = typeof $(this).attr("data-performingArtist") != 'undefined' ? $(this).attr("data-performingArtist") : "";
                var strWritingCredits = $("#txtWriters").val();
                strAltDiscPath = "";
                $.ajax({
                    type: "POST",
                    async: false,
                    url: "/Forms/TertiaryPage.aspx/TrackClick",
                    data: JSON.stringify({
                        'strWebPath': strWebPath,
                        'strFullName': strFullName,
                        'strFeatures': strFeatures,
                        'strTrackType': strTrackType,
                        'strCovers': strCovers,
                        'strOtherData': strOtherData,
                        'strEdition': strEdition,
                        'strEditionDate': strEditionDate,
                        'strDiscFullName': strDiscFullName,
                        'strSinglesPath': strSinglesPath,
                        'strVersion': "version",
                        'strOriginalArtist': strOriginalArtist,
                        'strWritingCredits': strWritingCredits,
                        'strPlaylist': strGlobIsPlaylist
                    }),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                    success: function (data) {
                        var strDataVersion = data.d.split(";");
                        if (strDataVersion[strDataVersion.length - 1].includes('Canvas')) {
                            if ($("#canvasSource").attr("src") != strDataVersion[strDataVersion.length - 1]) {
                                $("#canvasSource").attr("src", strDataVersion[strDataVersion.length - 1]);
                                $("#vidCanvas")[0].load();
                            }
                            strDataVersion.pop();
                        }
                        if (strDataVersion[strDataVersion.length - 1].includes('non_available')) {
                            $("#canvasSource").attr("src", "");
                            $("#vidCanvas")[0].load();
                            strDataVersion.pop();
                        }
                        if (strDataVersion[strDataVersion.length - 1].includes('AltDiscPath_')) {
                            strAltDiscPath = strDataVersion[strDataVersion.length - 1].replaceAll("AltDiscPath_", "");
                            strDataVersion.pop();
                        }
                        if (strDataVersion[strDataVersion.length - 2].includes('AltDiscPath_')) {
                            strAltDiscPath = strDataVersion[strDataVersion.length - 2].replaceAll("AltDiscPath_", "");
                            strDataVersion.splice(strDataVersion.length - 2, 1);
                        }
                        $("#imgCover").attr("src", strDataVersion[0]);
                        $("#imgDisc").attr("src", strDataVersion[1]);
                        $("#imgAltDisc").attr("src", strAltDiscPath);
                        $("#vidSource").attr("src", strDataVersion[3]);
                        $("#vidCover")[0].load();
                        var strReleaseName = strDataVersion[4];
                        var strTraDate = strDataVersion[5];
                        var strYouTubeLink = strDataVersion[7];
                        var strNewArtistID = strDataVersion[8];
                        var strOriginalArtist = strDataVersion[9];
                        var strWriters = typeof strDataVersion[10] != 'undefined' ? strDataVersion[10] : "";
                        var strWritersPlain = typeof strDataVersion[11] != 'undefined' ? strDataVersion[11] : "";
                        var strWritersFullField = typeof strDataVersion[12] != 'undefined' ? strDataVersion[12] : "";

                        $('body').css('background-image', 'url("' + strDataVersion[2] + '")');

                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/SecondaryPage.aspx/GetProminentColor",
                            data: JSON.stringify({
                                'strPath': strDataVersion[2]
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                currentColor = data.d;
                                $(".activeSec").css({
                                    "border-bottom": "1px solid " + currentColor,
                                    "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
                                });
                                $(".coloredText").css({ "color": currentColor });
                                $('.colorImage').css({ "filter": "drop-shadow(0px 0px 5px " + currentColor + ")" });

                                $(".activeTer").css({
                                    "border-bottom": "1px solid " + currentColor,
                                    "border-top": "1px solid " + currentColor,
                                    "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                                    "background-color": "rgba(0, 0, 0, 0.5)"
                                });

                                if (strOriginalArtist != "") {
                                    strFullName = strFullName.replace(";Performed by " + strOriginalArtist, "").replace("Performed by " + strOriginalArtist, "");
                                }

                                strFullName = strFullName.replace(strFeatures, "").replace(strCovers, "").replace(";", "").replace(" []", "").replace(" [ ", " [").replace(" language version", " version");
                                strFullName = strFullName.replace("[; ", "[");
                                var strBracketContent = "";
                                if (strFullName.indexOf("[") > 0) {
                                    strBracketContent = strFullName.substring(strFullName.indexOf("[") + 1, strFullName.lastIndexOf("]"));
                                }

                                strBracketContent = strBracketContent != "" ? strBracketContent.replaceAll("%27", "\'").replace("Performed by " + strOriginalArtist, "") : strOtherData.replace(" by " + strOriginalArtist, "");
                                strFullName = strFullName.slice(4).substring(0, strFullName.length - 8).replaceAll("%27", "'").replaceAll("[", "(").replaceAll("]", ")");
                                strFullName = strBracketContent != "" ? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";

                                //Original artist
                                if (strOriginalArtist != "") {
                                    strOriginalArtist = "<span>Performed by </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strOriginalArtist + "</span>"
                                }

                                //>2 features
                                if (strFeatures != "" && strFeatures.indexOf(" & ") > 0 && strFeatures.indexOf(",") > 0) {

                                    var strFeatureArray = strFeatures.split(',');
                                    for (var i = 0; i < strFeatureArray.length; ++i) {

                                        if (i == 0) {
                                            strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[i].replace("feat. ", "") + "</span>";
                                        }

                                        else if (strFeatureArray[i] != "" && strFeatureArray[i].indexOf(" & ") > 0) {
                                            var strFeatureArray2 = strFeatureArray[i].split('&');
                                            strFeatures = strFeatures + "<span>, </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray2[0] + "</span>" +
                                                "<span>& </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray2[1] + "</span>" + "<br>";
                                        }

                                        else {
                                            strFeatures = strFeatures + "<span>, </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[i] + "</span>";
                                        }
                                    }
                                }

                                //2 features
                                else if (strFeatures != "" && strFeatures.indexOf(" & ") > 0) {
                                    var strFeatureArray = strFeatures.split('&');
                                    strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[0].replace("feat. ", "") + "</span>" +
                                        "<span>and </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[1] + "</span>" + "<br>";
                                }

                                //1 feature
                                else if (strFeatures != "") {
                                    strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatures.replace("feat. ", "") + "</span><br>";
                                }

                                strEdition = strEdition != "" ? strEdition : strDataVersion[6];

                                if (strTrackNumber == "") {
                                    strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span><span>, " + strDiscFullName.substring(4) + "</span>" : strEdition != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                }
                                else {
                                    if (hasThreeDotsInFirst12Chars(strDiscFullName) == true && hasThreeDotsInFirst12Chars(strEdition) == true) {
                                        strEdition = strDiscFullName != "" ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span><span>, " + strDiscFullName.substring(12) + "</span>" : strEdition != "" ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                    }
                                    else if (hasThreeDotsInFirst12Chars(strDiscFullName) == true && hasThreeDotsInFirst12Chars(strEdition) == false) {
                                        strEdition = strDiscFullName != "" ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strDiscFullName.substring(12) + "</span>" : strEdition != "" ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                    }
                                    else {
                                        // Split the path into segments
                                        let segments = strWebPath.split("/");
                                        let refIndex = segments.indexOf(strEdition);
                                        let parentRelease = (refIndex > 0) ? segments[refIndex - 1] : "";
                                        var pattern = /^\d{4}\.\d{2}\.\d{2}\. /;
                                        strEdition =
                                            strDiscFullName != "" && pattern.test(parentRelease) ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + parentRelease.substring(12) + "</span><span>, " + strEdition.substring(12) + "</span>"
                                            : strEdition != "" && pattern.test(parentRelease) ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + parentRelease.substring(12) + "</span>"
                                            : strEdition != "" && !pattern.test(parentRelease) ? "<span>Track " + strTrackNumber + " from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                    }
                                }

                                strTraDate = "Released on " + strTraDate;
                                strCovers = strCovers != "" ? "<span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strCovers.replace(" cover", "") + "</span><span> cover</span><br>" : "";
                                strFullName = strFullName.replaceAll(";)<", ")<");
                                $("#traTitle").html(strFullName);
                                $("#traOriginal").html(strOriginalArtist);
                                $("#traWriters").html(strWriters.replaceAll("¿", ";").replaceAll("current_color", "aliceblue"));
                                $("#txtWriterField").val(strWritersPlain);
                                $("#txtWriters").val(strWritersFullField.replaceAll('¿', ';'));
                                $("#traFeat").html(strFeatures);
                                $("#traRelease").html(strEdition);
                                $("#traDate").text(strTraDate);
                                $("#traCover").html(strCovers);

                                //Click on release to redirect
                                $(".aAlbumPageAnchor").click(function () {
                                    var strNewArtistID = typeof $(this).attr("data-newartist") != 'undefined' ? $(this).attr("data-newartist") : "";
                                    var strValue = $(this).text();
                                    $.ajax({
                                        type: "POST",
                                        async: false,
                                        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                        data: JSON.stringify({
                                            'strSession1': strNewArtistID,
                                            'strSession2': "Return",
                                            'strSession3': "",
                                            'strSession4': "no",
                                        }),
                                        contentType: "application/json; charset=utf-8",
                                        dataType: "json",
                                        success: function (data) {
                                            var sessionVariables = data.d.split(";");
                                            setTimeout(function () {
                                                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
                                            }, 300);

                                        }
                                    });
                                });

                                //Click on writer to redirect
                                $(".spaWriterName").click(function () {
                                    var strNewArtistID = $(this).text();
                                    var strValue = $(this).attr("data-href");
                                    if (strValue.indexOf("https://") == -1) {
                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                            data: JSON.stringify({
                                                'strSession1': strNewArtistID,
                                                'strSession2': "bands",
                                                'strSession3': "",
                                                'strSession4': "",
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {
                                                var sessionVariables = data.d.split(";");
                                                setTimeout(function () {
                                                    window.location.replace("/Media/Music/" + strValue.replace("&", "¿"));
                                                }, 300);

                                            }
                                        });
                                    }
                                    else {
                                        window.open(strValue, "_blank");
                                    }
                                });

                                //Toggle youtube video button
                                if (strYouTubeLink != "") {
                                    $('#divVideos').css("visibility", "visible");
                                    $("#divTrackButtons").css({ "margin-left": "87px" });
                                    $("#butVideos").attr("href", strYouTubeLink.replace("/watch?v=", "/embed/") + "?fs=1&autoplay=1");
                                }
                                else {
                                    $('#divVideos').css("visibility", "hidden");
                                    $("#divTrackButtons").css({ "margin-left": "140px" });
                                }

                                //Check for featured artists/covered //Version

                                $('.artistRef').on("click", function () {
                                    var strArtistName = ($(this).text());

                                    $.ajax({
                                        type: "POST",
                                        async: false,
                                        url: "/Forms/TertiaryPage.aspx/ArtistLookup",
                                        data: JSON.stringify({
                                            'strArtistName': strArtistName
                                        }),
                                        contentType: "application/json; charset=utf-8",
                                        dataType: "json",
                                        success: function (data) {
                                            //If folder is found, then redirect
                                            if (data.d.indexOf("https://") == -1) {
                                                setTimeout(function () {
                                                    window.location.replace("/Media/Music/" + data.d);
                                                }, 300);
                                            }

                                            //if not found look into wikipedia/google
                                            else {
                                                window.open(data.d, "_blank");
                                            }
                                        }
                                    })
                                })
                                strGlobReleaseName = strFullName;

                                //Writer label click
                                $(".spaWriterLabel").click(function () {
                                    $("#traWriters").css({ 'display': 'none' });
                                    $("#txtWriterField").css({ 'display': 'block' });
                                });
                            }
                        });
                    }
                });

                $(".hp_range").css({ "background": currentColor });
                var rgbacolor = hexToRgb(currentColor);
                $(".hp_slide").css({ "background": "rgba(" + rgbacolor + ", 0.3)" });
                $('.trackRowVersion:first').addClass("firstTrackRowVersion");
                $('.trackRowVersion:last').addClass("lastTrackRowVersion");

            });

        }
    })
})

// Check for lyrics
$('#butLyrics').on("click", function () {
    var strTrackTitle = strGlobReleaseName;
    var strArtistFeat = $(".artistFeat:first").text();
    if (strArtistFeat.startsWith(" ")) 
    {
        strArtistFeat = strArtistFeat.substring(1);
    }
    if (strGlobActiveSection != "Versions") {
        $('#butVersions').css("display", "none");
    }
    $('#divContainerTracks').css("visibility", "hidden");
    $('#divContainerVersions').css("visibility", "hidden");
    $('#divContainerLyrics').css("visibility", "visible");
    $('#butReturnTracklistVer').css("display", "none");
    $('#butLyrics').css("display", "none");
    strGlobActiveLyrics = "Yes";
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/TertiaryPage.aspx/TrackLyrics",
        data: JSON.stringify({
            'strTrackTitle': strArtistFeat != "" ? strTrackTitle + "^" + strArtistFeat : strTrackTitle,
            'strColor': currentColor
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            $("#divContainerLyrics").html(data.d);
            $('#butReturnTracklistLyr').css("display", "block");
        }
    })
})

$('.menuBarButtonThi').on("click", function () {
    $('#subcontentSection2').removeClass("scrollableItemsDiv");
    $('#subcontentSection2').css("visibility", "hidden");
    $('#subcontentSection3').removeClass("scrollableItemsDiv");
    $('#subcontentSection3').css("visibility", "hidden");
    $('.menuBarButtonThi').removeClass("activeSec");
    $('#subcontentSection').removeClass("scrollableItemsDiv");
    $('#subcontentSection').css("visibility", "hidden");

    $(this).addClass("activeSec");

    $(".menuBarButtonThi").css({
        "border-bottom": "0",
        "text-shadow": "0 0"
    });

    $(this).css({
        "border-bottom": "1px solid " + currentColor,
        "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
    });

    //Overview releases
    if ($(this).attr("data-value") == '25') {
        strTabClick = 1;
        strGlobActive = "Overview";
        $('#subcontentSection2').css("visibility", "hidden");
        $('#subcontentSection3').css("visibility", "hidden");
        $('#divContainerLeft').css("visibility", "visible");
        $('#divContainerRight').css("visibility", "visible");
        $('#divAlbumDetails').css("visibility", "visible");
        $('#divAlbumGeneral').css("visibility", "visible");
        $('#divContainerTracks').css("visibility", "hidden");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#divContainerLyrics').css("visibility", "hidden");
        $('#divContainerGallery').css("visibility", "hidden");
        $('#divTrackDetails').css("display", "none");
        $('#divTrackButtons').css("visibility", "hidden");
        $('#divPlayer').css("visibility", "hidden");
        $('#divExtraData').css("visibility", "visible");
        $('#divCodes').css("visibility", "visible");
        $('#divQR').css("visibility", "visible");
        //$("#imgCover").attr("src", $("#txtCover").val());
        //$("#imgDisc").attr("src", $("#txtDisc").val());
        //$('body').css('background-image', 'url("' + $("#txtBack").val() + '")');

        if (strGlobIsPlaylist == "1") {
            $('#divQR').css("display", "block");
            $('#divCodes').css("display", "block");
            $('#divExtraData').css("display", "block");
            $('#divPlayer').css("display", "none");
        }

        if (!$(".activeMainTrack").hasClass("videoRow")) {
            $(".activeMainTrack").click();
        }
        $("#divContainerLyrics").html("");
        $("#divContainerVersions").html("");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#divContainerLyrics').css("visibility", "hidden");

        $('#butVersions').css("display", "block");
        $('#butLyrics').css("display", "block");
        $('#divVideos').css("visibility", "hidden");
        $('.butReturnTracklist').css("display", "none");
        $('#divTrackButtons').css("visibility", "hidden");
        $('#subcontentSection').css({ "top": "140px" });
        $('#subcontentSection2').css({ "top": "140px" });
        $('#subcontentSection3').css({ "top": "140px" });
        $('#filterBarSection2').css("display", "none");
    }
    //Tracklist
    else if ($(this).attr("data-value") == '26') {
        strTabClick = 1;
        strGlobActive = "Tracklist";
        $('#subcontentSection2').css("visibility", "hidden");
        $('#subcontentSection3').css("visibility", "hidden");
        $('#divContainerLeft').css("visibility", "visible");
        $('#divContainerRight').css("visibility", "visible");
        $('#divContainerTracks').css("visibility", "visible");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#divContainerLyrics').css("visibility", "hidden");
        $('#divContainerGallery').css("visibility", "hidden");
        $('#divAlbumGeneral').css("visibility", "hidden");
        $('#divAlbumDetails').css("visibility", "hidden");
        $('#divTrackDetails').css("display", "block");
        $('#divTrackButtons').css("visibility", "hidden");
        if (!$(".activeMainTrack").hasClass("videoRow")) {
            $(".activeMainTrack").click();
        }
        $('#divPlayer').css("visibility", "visible");
        $('#divExtraData').css("visibility", "hidden");
        $('#divCodes').css("visibility", "hidden");
        $('#divQR').css("visibility", "hidden");
        $('#subcontentSection').css({ "top": "140px" });
        $('#subcontentSection2').css({ "top": "140px" });
        $('#subcontentSection3').css({ "top": "140px" });
        $('#filterBarSection2').css("display", "none");

        if (strGlobIsPlaylist == "1") {
            $('#divQR').css("display", "none");
            $('#divCodes').css("display", "none");
            $('#divExtraData').css("display", "none");
            $('#divPlayer').css("display", "block");
            $('#divPlayer').css("margin-top", "60px");
        }

    }
    //Release gallery
    else if ($(this).attr("data-value") == '27') {
        strTabClick = 1;
        strGlobActive = "Gallery";

        $('#divContainerRight').css("visibility", "hidden");
        $('#divContainerLeft').css("visibility", "hidden");
        $('#divAlbumGeneral').css("visibility", "hidden");
        $('#divContainerTracks').css("visibility", "hidden");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#divContainerLyrics').css("visibility", "hidden");
        $('#divAlbumDetails').css("visibility", "hidden");
        $('#divTrackDetails').css("display", "none");
        $('#divTrackButtons').css("visibility", "hidden");
        $('#divPlayer').css("visibility", "hidden");
        $('#divExtraData').css("visibility", "hidden");
        $('#divCodes').css("visibility", "hidden");
        $('#divQR').css("visibility", "hidden");
        isPromoRelease = "false";
        if (!$(".activeMainTrack").hasClass("videoRow")) {
            $(".activeMainTrack").click();
        }
        if ($(".activeMainTrack").hasClass("promoMaterialRow")) {
            isPromoRelease = "Promo Release";
        }
        $("#divContainerLyrics").html("");
        $("#divContainerVersions").html("");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#divContainerLyrics').css("visibility", "hidden");

        $('#butVersions').css("display", "block");
        $('#butLyrics').css("display", "block");
        $('#divVideos').css("visibility", "hidden");
        $('.butReturnTracklist').css("display", "none");
        $('#divTrackButtons').css("visibility", "hidden");
        $('#filterBarSection2').css("display", "block");


        $('.menuBarButtonSec').removeClass("activeSec");
        $('.menuSubItemSec').removeClass("activeSec");

        $(".menuBarButtonSec").css({
            "border-bottom": "0",
            "text-shadow": "0 0"
        });

        $(".menuSubItemSec").css({
            "border-bottom": "0",
            "text-shadow": "0 0"
        });

        $("#SubMainFilterOpt0").addClass("activeSec");
        $("#SubMainFilterOpt0").css({
            "border-bottom": "1px solid " + currentColor,
            "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
        });

        if (strGlobCActiveEdition != "" && strGlobCurrentEdition == strGlobCActiveEdition) {
            $('#subcontentSection').addClass("scrollableItemsDiv");
            $('#subcontentSection').css("visibility", "visible");
        }

        else {
            strGlobCActiveEdition = strGlobCurrentEdition;

            strLinkedReleaseTitle = $("#traRelease").html().indexOf("Taken from:") >= 0 && $("#traRelease").html().indexOf(" Single") >= 0 ? $("#traRelease").text().replaceAll("Taken from: ", "").replaceAll(" Single", "") : "";
            strLinkedReleasePath = $("#traRelease").html().indexOf("Taken from:") >= 0 && $("#traRelease").html().indexOf(" Single") >= 0 ? "05. Singles [Music]" : "";
            var strTourData = typeof $(".activeMainTrack").attr("data-tour") != 'undefined' ? $(".activeMainTrack").attr("data-tour") : "";
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/SecondaryPage.aspx/FillContentPage",
                data: JSON.stringify({
                    'strFolder': isPromoRelease == "Promo Release" ? isPromoRelease : "[Release]" + strGlobCActiveEdition,
                    'strLinkedReleaseTitle': strLinkedReleaseTitle,
                    'strLinkedReleasePath': strLinkedReleasePath,
                    'strTourData': strTourData,
                    'strShowDate': strGlobShowDate,
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    if (strGlobActive == "Gallery") {
                        //$('#subcontentSection').empty().append(data.d);
                        //$('#subcontentSection').css("visibility", "visible");
                        data.d = data.d.split('●');

                        $('#filterBarSection2').empty().append(data.d[0]);
                        $('#subcontentSection').empty().append(data.d[1]);
                        $('#subcontentSection2').empty().append(data.d[2]);
                        if (3 == data.d.length -1) {
                            $('#subcontentSection3').empty().append(data.d[3]);
                        }

                        $("#SubMainFilterOpt0").addClass("activeSec");
                        $("#SubMainFilterOpt0").css({
                            "border-bottom": "1px solid " + currentColor,
                            "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
                        });
                    }

                    $('#subcontentSection').addClass("scrollableItemsDiv");
                    $('#subcontentSection').css({ "visibility": "visible", "top": "140px" });
                    $('#subcontentSection2').addClass("scrollableItemsDiv");
                    $('#subcontentSection2').css({ "visibility": "hidden", "top": "140px" });
                    $('#subcontentSection3').addClass("scrollableItemsDiv");
                    $('#subcontentSection3').css({ "visibility": "hidden", "top": "140px" });

                    //on click item
                    $('.itemBox').on("click", function () {
                        if ($(this).hasClass("ItemNotFound")) {
                            $(this).siblings(".aNotFound").click();
                        }
                        else {
                            var strItemPath = $(this).attr("data-url");
                            var strImagePaths = "";
                            if ($(this).hasClass("divScanItem")) {
                                $('.divScanItem').each(function (i, obj) {
                                    strImagePaths = strImagePaths == "" ? $(this).attr("data-url") : strImagePaths + ";" + $(this).attr("data-url");
                                });
                            }
                            else if ($(this).hasClass("classReleaseGallery")) {
                                let activeSection = "classRelease-" + $(".SubChar.activeSec").text().toLowerCase();
                                if ($(this).hasClass(activeSection)) {
                                    $('.' + activeSection).each(function (i, obj) {
                                        if (typeof $(this).attr("data-url") != 'undefined') {
                                            strImagePaths = strImagePaths == "" ? $(this).attr("data-url") : strImagePaths + ";" + $(this).attr("data-url");
                                        }
                                    });
                                }
                            }
                            else {
                                $('.divPhotoItem').each(function (i, obj) {
                                    if (typeof $(this).attr("data-url") != 'undefined') {
                                        strImagePaths = strImagePaths == "" ? $(this).attr("data-url") : strImagePaths + ";" + $(this).attr("data-url");
                                    }
                                });
                            }

                            if (strItemPath != "") {
                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                    data: JSON.stringify({
                                        'strSession1': strItemPath,
                                        'strSession2': "ImagePath",
                                        'strSession3': strImagePaths,
                                        'strSession4': "",
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {

                                        setTimeout(function () {
                                            $("#modalGalleryDataDiv").click();
                                            document.getElementById("galleryFrame").contentDocument.location.reload(true);
                                        }, 300);
                                    }
                                });
                            }
                        }
                    });
                }
            });
        }
        //Main items hover
        $('.menuBarButtonSec').on("mouseover", function () {
            if (!$(this).hasClass("activeSec")) {
                $(this).css({ "border-bottom": "1px solid aliceblue" });
            }

        });
        $('.menuBarButtonSec').on("mouseleave", function () {
            if (!$(this).hasClass("activeSec")) {
                $(this).css({ "border-bottom": "0" });
            }
        });

        $('.menuBarButtonSec').on("click", function () {
            $('.menuBarButtonSec').removeClass("activeSec");
            $('.menuSubItemSec').removeClass("activeSec");

            $(".menuBarButtonSec").css({
                "border-bottom": "0",
                "text-shadow": "0 0"
            });

            $(".menuSubItemSec").css({
                "border-bottom": "0",
                "text-shadow": "0 0"
            });

            $(this).addClass("activeSec");
            $(this).css({
                "border-bottom": "1px solid " + currentColor,
                "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
            });

            $(".coloredText").css({ "color": currentColor });


            //If it's scans, hide photos
            if ($(this).attr("data-field") == "artwork") {

                $('#subcontentSection').css({ 'visibility': 'visible' });
                $('#subcontentSection2').css({ 'visibility': 'hidden' });
                $('#subcontentSection3').css({ 'visibility': 'hidden' });

                $('#subcontentSection2').removeClass("scrollableItemsDiv");
                $('#subcontentSection3').removeClass("scrollableItemsDiv");
                $('#subcontentSection').addClass("scrollableItemsDiv");
            }

            //If it's photos, hide artwork
            else if ($(this).attr("data-field") == "photos") {

                $('#subcontentSection').css({ 'visibility': 'hidden' });
                $('#subcontentSection').removeClass("scrollableItemsDiv");
                $('#subcontentSection3').css({ 'visibility': 'hidden' });
                $('#subcontentSection3').removeClass("scrollableItemsDiv");
                $('#subcontentSection2').addClass("scrollableItemsDiv");
                $('#subcontentSection2').css({ 'visibility': 'visible' });
            }
            else if ($(this).attr("data-field") == "other") {

                $('#subcontentSection').css({ 'visibility': 'hidden' });
                $('#subcontentSection').removeClass("scrollableItemsDiv");
                $('#subcontentSection2').css({ 'visibility': 'hidden' });
                $('#subcontentSection2').removeClass("scrollableItemsDiv");
                $('#subcontentSection3').addClass("scrollableItemsDiv");
                $('#subcontentSection3').css({ 'visibility': 'visible' });
            }
        });





    }
});

$('.menuBarButtonThi').on("mouseover", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "1px solid aliceblue" });
    }
});

$('.menuBarButtonThi').on("mouseleave", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "0" });
    }
});

$('.menuBarButtonSec').on("click", function () {
    $('.menuBarButtonSec').removeClass("activeSec");
    $('.menuSubItemSec').removeClass("activeSec");

    $(".menuBarButtonSec").css({
        "border-bottom": "0",
        "text-shadow": "0 0"
    });

    $(".menuSubItemSec").css({
        "border-bottom": "0",
        "text-shadow": "0 0"
    });

    $(this).addClass("activeSec");
    $(this).css({
        "border-bottom": "1px solid " + currentColor,
        "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
    });
    $(".coloredText").css({ "color": currentColor });
    $('#subcontentSection').empty().css("visibility", "hidden");
    $('#subcontentSection2').empty().css("visibility", "hidden");
    $('#subcontentSection3').empty().css("visibility", "hidden");
    $('#contentSection').empty()
    $('#divOtherContainers').empty();
    $('#divContainer').css("visibility", "hidden");
    $("#divEditSection").css({ 'display': 'none' });
    $("#bndEdit").css("display", "none");
    $("#bndRefreshTop").css("display", "none");
    $("#bndAddMember").css("display", "none");
    $("#bndSave").css("display", "none");
    $(".divSubFilterSec").css({ 'display': 'none' });
    $('.menuSubItemSec').removeClass("activeSec");
    $(".menuSubItemSec").css({ "border-bottom": "0", "text-shadow": "0 0" });
    $("#subFilterBarSection").css("visibility", "hidden");

    var strMainOption = $(this).text().toLowerCase();

    if (strMainOption == "overview") {
        $("#filterSubItem15").click();
        $("#filterBarSection2").css({ "visibility": "hidden" });
        $("#filterBarSection").css({ "visibility": "visible" });
    }

    else {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/FillSubFilters",
            data: JSON.stringify({
                'strTable': currentColor,
                'strFields': $("#subMenuItems").val(),
                'strParent': strMainOption,
                'strDataType': 'main-subitem'
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                $("#filterBarSection").css({ "visibility": "hidden" });
                if (data.d.includes("VARIOUS_ARTISTS")) {
                    data.d = data.d.replace(/VARIOUS_ARTISTS/g, "");
                    $("#filterBarSection2").css({ "visibility": "visible", "margin-top": "0px" });
                }
                else {
                    $("#filterBarSection2").css({ "visibility": "visible", "margin-top": "-22px" });
                }
                
                $('#filterBarSection2').empty().append(data.d);

                if (strMainOption == "video" || strMainOption == "library") {
                    $('#filterBarSection2').css("visibility", "hidden");
                }

                //Main items hover

                $('.subfilterOption2').on("mouseover", function () {
                    if (!$(this).hasClass("activeSec")) {
                        $(this).css({ "border-bottom": "1px solid aliceblue" });
                    }

                });
                $('.subfilterOption2').on("mouseleave", function () {
                    if (!$(this).hasClass("activeSec")) {
                        $(this).css({ "border-bottom": "0" });
                    }
                });

                $('.subfilterOption2').on("click", function () {
                    $('.subfilterOption2').removeClass("activeSec");
                    $(".subfilterOption2").css({ "border-bottom": "0", "text-shadow": "0 0" });
                    $(this).addClass("activeSec").css({ "border-bottom": "1px solid " + currentColor, "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor });

                    $.ajax({
                        type: "POST",
                        async: false,
                        url: "/Forms/SecondaryPage.aspx/FillContentPage",
                        data: JSON.stringify({
                            'strFolder': $(this).attr("data-field"),
                            'strLinkedReleaseTitle': "",
                            'strLinkedReleasePath': "",
                            'strTourData': "",
                            'strShowDate': "",
                        }),
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        success: function (data) {
                            $('#subcontentSection').empty().append(data.d);
                            $('#subcontentSection').css("visibility", "visible");

                            //on click item
                            $('.itemBox').on("click", function () {
                                var strSection = $(this).attr("data-section");
                                var strVideoType = $(this).attr("data-video-type");
                                //if it's [Music] orVideo Series
                                if (strSection.indexOf("/audio") >= 0 || strSection.indexOf("[playlists]") >= 0 ||  strSection.indexOf("/video") >= 0) {
                                    var strReleaseName = $(this).attr("data-fullname");
                                    //write session variable for name of item
                                    if (strSection.indexOf("[playlists]") >= 0) {
                                        strGlobIsPlaylist = "1";
                                    }
                                    else {
                                        strGlobIsPlaylist = "0";
                                    }
                                    if (typeof $(this).attr("data-external") != 'undefined') {
                                        var strExternal = $(this).attr("data-external");
                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                            data: JSON.stringify({
                                                'strSession1': strReleaseName,
                                                'strSession2': "curReleaseName2",
                                                'strSession3': strSection + ";" + strExternal,
                                                'strSession4': "",
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {
                                                //redirect to page 3
                                                var sessionVariables = data.d.split(";");
                                                setTimeout(function () {

                                                    if (strReleaseName.indexOf(" [By") >= 0) {
                                                        strReleaseName = strReleaseName.split(" [")[0];
                                                    }

                                                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strReleaseName.slice(12).replace('.', '·').replace("&", "¿"));

                                                }, 500);

                                            }
                                        });
                                    }

                                    else {
                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                            data: JSON.stringify({
                                                'strSession1': strReleaseName,
                                                'strSession2': "curReleaseName",
                                                'strSession3': strSection,
                                                'strSession4': "",
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {
                                                //redirect to page 3
                                                var sessionVariables = data.d.split(";");
                                                setTimeout(function () {
                                                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strReleaseName.slice(12).replace('.', '·').replace("&", "¿"));

                                                }, 500);

                                            }
                                        });
                                    }

                                }
                                //Library
                                else if (typeof $(this).attr("data-url") != 'undefined' && $(this).attr("data-url").includes("/library/")) {
                                    window.open($(this).attr("data-url"), '_blank');
                                }
                                else {
                                    //Gallery
                                    var strItemPath = $(this).attr("data-url");
                                    var strImagePaths = "";
                                    $('.itemBox').each(function (i, obj) {
                                        strImagePaths = strImagePaths == "" ? $(this).attr("data-url") : strImagePaths + ";" + $(this).attr("data-url");
                                    });
                                    if (strItemPath != "") {
                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                            data: JSON.stringify({
                                                'strSession1': strItemPath,
                                                'strSession2': "ImagePath",
                                                'strSession3': strImagePaths,
                                                'strSession4': "",
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {

                                                setTimeout(function () {
                                                    $("#modalGalleryDataDiv").click();
                                                    document.getElementById("galleryFrame").contentDocument.location.reload(true);
                                                }, 300);

                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });

                });

                $(".subfilterOption2:first").click();
            }
        });
    }
});

//Main items hover
$('.menuBarButtonSec').on("mouseover", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "1px solid aliceblue" });
    }

});
$('.menuBarButtonSec').on("mouseleave", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "0" });
    }
});

//Sub items
$('.menuSubItemSec').on("mouseover", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "1px solid aliceblue" });
    }

});
$('.menuSubItemSec').on("mouseleave", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "0" });
    }
});

$('.subfilterOption').on("mouseover", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "1px solid aliceblue" });
    }

});
$('.subfilterOption').on("mouseleave", function () {
    if (!$(this).hasClass("activeSec")) {
        $(this).css({ "border-bottom": "0" });
    }
});

$('.menuBarButtonSec ').on("click", function () {
    var strChosenOption = $(this).text().toLowerCase();
    if (strChosenOption == "overview") {
        $('.content').removeClass('scrollableItemsDiv');
        $('#divPlayer').css("visibility", "visible");
    }
    else {
        $('.content').addClass('scrollableItemsDiv');
        $('#divPlayer').css("visibility", "hidden");
    }

});

$('.menuSubItemSec').on("click", function () {
    $('#subcontentSection').empty().css("visibility", "hidden");
    $('#subcontentSection2').empty().css("visibility", "hidden");
    $('#subcontentSection3').empty().css("visibility", "hidden");
    $('#contentSection').empty()
    $('#divOtherContainers').empty();
    $('#divContainer').css("visibility", "hidden");
    $("#divEditSection").css({ 'display': 'none' });
    $("#bndEdit").css("display", "none");
    $("#bndRefreshTop").css("display", "none");
    $("#bndAddMember").css("display", "none");
    $("#bndSave").css("display", "none");
    $(".divSubFilterSec").css({ 'display': 'none' });
    $('.menuSubItemSec').removeClass("activeSec");
    $(".menuSubItemSec").css({ "border-bottom": "0", "text-shadow": "0 0" });
    $(this).addClass("activeSec");
    $(this).css({ "border-bottom": "1px solid " + currentColor, "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor });
    $(".coloredText").css({ "color": currentColor });
    var itemSection = $(this).attr("data-parent");
    var strMainOption = $(this).text().toLowerCase();
    var itemTable = $(this).attr("data-table");
    var itemType = $(this).attr("data-type");
    if (strMainOption == "about") {
        $("body").css("overflow", "show");
        $("#bndEdit").css("display", "block");
        $("#bndRefreshTop").css("display", "block");
        $('#divContainer').css("visibility", "visible");
        $('#divPlayer').css("visibility", "visible");
        $('.subfilternav').empty();
    }
    else {
        $('#divPlayer').css("visibility", "hidden");
        $("#subFilterBarSection").css("visibility", "visible");
        if (strMainOption == "personnel") {
            $("#bndAddMember").css("display", "block");
        }
        else {
            $("#bndAddMember").css("display", "none");
        }

        var strButtonDataId = $(this).attr("data-id");
        var strFields = strButtonDataId != "18" ? $(this).attr("data-field") : "Similar Music;Other Participations";

        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/FillSubFilters",
            data: JSON.stringify({
                'strTable': itemTable,
                'strFields': strFields,
                'strParent': $(this).attr("data-parent"),
                'strDataType': itemType
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                if (data.d.includes("VARIOUS_ARTISTS")) {
                    data.d = data.d.replace(/VARIOUS_ARTISTS/g, "");
                }
                $('.subfilternav').empty().append(data.d);
                $('.subfilterOption').removeClass("activeSec");
                $(".subfilterOption").css({ "border-bottom": "0", "text-shadow": "0 0" });
                $(".subfilterOption:first").addClass("activeSec").css({ "border-bottom": "1px solid " + currentColor, "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor })
                $(".divSubFilter" + itemSection).css({ 'display': 'block' });


                $('.subfilterOption').on("click", function () {
                    $('.subfilterOption').removeClass("activeSec");
                    $(".subfilterOption").css({ "border-bottom": "0", "text-shadow": "0 0" });
                    $(this).addClass("activeSec");
                    $(this).css({ "border-bottom": "1px solid " + currentColor, "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor });

                    $('.subfilterOption').on("mouseover", function () {
                        if (!$(this).hasClass("activeSec")) {
                            $(this).css({ "border-bottom": "1px solid aliceblue" });
                        }

                    });
                    $('.subfilterOption').on("mouseleave", function () {
                        if (!$(this).hasClass("activeSec")) {
                            $(this).css({ "border-bottom": "0" });
                        }
                    });

                    $.ajax({
                        type: "POST",
                        async: false,
                        url: "/Forms/PrimaryPage.aspx/DisplayContent",
                        data: JSON.stringify({
                            'strOption': strMainOption,
                            'strID': $(this).attr("data-id"),
                            'strTable': itemTable,
                            'strDataType': itemType,
                            'strViewMode': "C",
                            'strCurColor': currentColor
                        }),
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        success: function (data) {
                            data.d = data.d.replace(/\■/g, ',').replace(/\█/g, '\'');
                            strButtonDataId != "18" ? $('#contentSection').empty().append(data.d) : $('#contentSection').empty().append($('#contentSection2').html());
                            strButtonDataId != "18" ? $('#contentSection').css({ "margin-left": "auto", "margin-right": "auto", "width": "auto" }) : $('#contentSection').css({ "margin-left": "auto", "margin-right": "auto", "width": "100%" });

                            if (strButtonDataId == "18") {

                                $("#SubFilterOpt0").click(function () {
                                    $("#divContentRelated").css({ "display": "none" });
                                    $("#divContentSimilar").css({ "display": "block" });
                                    $("#divSimilarButtons").css({ "display": "flex" });

                                })

                                $("#SubFilterOpt1").click(function () {
                                    $("#divContentSimilar").css({ "display": "none" });
                                    $("#divContentRelated").css({ "display": "block" });
                                    $("#divSimilarButtons").css({ "display": "none" });
                                })

                                $("#bndAddSimilar").click(function () {
                                    strGlobActiveSimilar = "add";
                                    $("#inpAddSimilar").css({ "display": "inline-block" });
                                    $("#bndAddSimilar").css({ "display": "none" });
                                    $("#bndDelSimilar").css({ "display": "none" });
                                    $("#bndRefreshSimilar").css({ "display": "none" });
                                });
                                $("#bndDelSimilar").click(function () {
                                    strGlobActiveSimilar = "del";
                                    $("#inpAddSimilar").css({ "display": "inline-block" });
                                    $("#bndAddSimilar").css({ "display": "none" });
                                    $("#bndDelSimilar").css({ "display": "none" });
                                    $("#bndRefreshSimilar").css({ "display": "none" });
                                });

                                //Update details
                                $('#inpAddSimilar').keyup(function (e) {
                                    if (e.keyCode == 13) {
                                        e.preventDefault()
                                        var strNewArtists = $(this).val();
                                        var strSimilarUrl = strGlobActiveSimilar == "del" ? "/Forms/SecondaryPage.aspx/DeleteSimilarArtists" : "/Forms/SecondaryPage.aspx/AddSimilarArtists";
                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: strSimilarUrl,
                                            data: JSON.stringify({
                                                'strCurColor': currentColor,
                                                'strArtistNames': strNewArtists
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {
                                                $("#divContentSimilar").empty();
                                                $("#divContentSimilar").append(data.d.replaceAll("%27", "'"));
                                                $("#inpAddSimilar").css({ "display": "none" });
                                                $("#bndAddSimilar").css({ "display": "inline-block" });
                                                $("#bndDelSimilar").css({ "display": "inline-block" });
                                                $("#bndRefreshSimilar").css({ "display": "inline-block" });
                                                $("#inpAddSimilar").val("");
                                            }
                                        });
                                    }
                                });

                                $("#bndRefreshSimilar").click(function () {
                                    $.ajax({
                                        type: "POST",
                                        async: false,
                                        url: "/Forms/SecondaryPage.aspx/RefreshSimilarArtists",
                                        data: JSON.stringify({
                                            'strCurColor': currentColor
                                        }),
                                        contentType: "application/json; charset=utf-8",
                                        dataType: "json",
                                        success: function (data) {
                                            //Add data
                                            var result = data.d;
                                            if (result != "") {
                                                $("#divContentSimilar").empty();
                                                $("#divContentSimilar").append(result.replaceAll("%27", "'"));
                                            }
                                        }
                                    });
                                });

                                //Redirect to artist if clicking on related
                                $(".itemBoxRelated").click(function () {
                                    if ($(this).hasClass("ItemNotFound")) {
                                        var strLink = $(this).children(".aNotFound").attr("href");
                                        window.open(strLink, '_blank');
                                    }
                                    else {
                                        var strClickedProject = $(this).attr("data-name");
                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: "/Forms/TertiaryPage.aspx/ArtistLookup",
                                            data: JSON.stringify({
                                                'strArtistName': strClickedProject
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {
                                                //If folder is found, then redirect
                                                if (data.d.indexOf("https://") == -1) {
                                                    setTimeout(function () {
                                                        window.location.replace("/Media/Music/" + data.d);
                                                    }, 300);
                                                }

                                                //if not found look into wikipedia/google
                                                else {
                                                    window.open(data.d, "_blank");
                                                }
                                            }
                                        })
                                    }
                                });
                            }

                            $(".divArtistPhoto").hover(
                                function () {
                                    $(this).css({
                                        "border": "3px solid " + currentColor,
                                        "cursor": "pointer",
                                        "-webkit-transform": "scale(1.1, 1.1)",
                                        "-webkit-transition": "all 0.2s ease-in-out",
                                        "filter": "none"
                                    })
                                },
                                function () {
                                    $(this).css({
                                        "border": "0px solid " + currentColor,
                                        "cursor": "pointer",
                                        "-webkit-transform": "scale(1, 1)",
                                        "-webkit-transition": "all 0.2s ease-in-out",
                                        "filter": "none"
                                    })
                                }
                            );

                            $(".imgArtistLink").hover(
                                function () {
                                    $(this).css({
                                        "filter": "drop-shadow(0px 0px 2px " + currentColor + ")",
                                        "cursor": "pointer",
                                        "-webkit-transform": "scale(1.1, 1.1)",
                                        "-webkit-transition": "all 0.2s ease-in-out"
                                    })
                                },
                                function () {
                                    $(this).css({
                                        "cursor": "pointer",
                                        "-webkit-transform": "scale(1, 1)",
                                        "-webkit-transition": "all 0.2s ease-in-out",
                                        "filter": "none"
                                    })
                                }
                            );

                            $(".divArtistPhoto").click(function () {
                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                    data: JSON.stringify({
                                        'strSession1': $(this).attr("data-id"),
                                        'strSession2': "curPersonID",
                                        'strSession3': currentColor,
                                        'strSession4': "",
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {

                                        setTimeout(function () {

                                            $("#modalArtistDataDiv").click();
                                            document.getElementById("artistDataFrame").contentDocument.location.reload(true);
                                            $("#artistDataFrame").css({ "border": "black 0.1px solid" });
                                        }, 300);

                                    }
                                });

                            });

                            $('.artistRef').on("click", function () {
                                var strArtistName = ($(this).text());

                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/TertiaryPage.aspx/ArtistLookup",
                                    data: JSON.stringify({
                                        'strArtistName': strArtistName
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {
                                        //If folder is found, then redirect
                                        if (data.d.indexOf("https://") == -1) {
                                            setTimeout(function () {
                                                window.location.replace("/Media/Music/" + data.d);
                                            }, 300);
                                        }

                                        //if not found look into wikipedia/google
                                        else {
                                            window.open(data.d, "_blank");
                                        }
                                    }
                                })
                            })

                            $("#bndAddMember").click(function () {
                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                    data: JSON.stringify({
                                        'strSession1': "0",
                                        'strSession2': "curPersonID",
                                        'strSession3': currentColor,
                                        'strSession4': "",
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {

                                        setTimeout(function () {
                                            $("#modalArtistDataDiv").click();
                                            document.getElementById("artistDataFrame").contentDocument.location.reload(true);
                                            $("#artistDataFrame").css({ "border": "black 0.1px solid" });
                                            $("#artEdit").click();
                                        }, 300);

                                    }
                                });

                            });
                        }
                    });
                });
                //Related projects
                if (strButtonDataId == "18") {

                    $("#SubFilterOpt0").click(function () {
                        $("#divContentRelated").css({ "display": "none" });
                        $("#divContentSimilar").css({ "display": "block" });
                        $("#divSimilarButtons").css({ "display": "flex" });

                    })

                    $("#SubFilterOpt1").click(function () {
                        $("#divContentSimilar").css({ "display": "none" });
                        $("#divContentRelated").css({ "display": "block" });
                        $("#divSimilarButtons").css({ "display": "none" });
                    })

                    $("#bndAddSimilar").click(function () {
                        strGlobActiveSimilar = "add";
                        $("#inpAddSimilar").css({ "display": "inline-block" });
                        $("#bndAddSimilar").css({ "display": "none" });
                        $("#bndDelSimilar").css({ "display": "none" });
                        $("#bndRefreshSimilar").css({ "display": "none" });
                    });

                    $("#bndDelSimilar").click(function () {
                        strGlobActiveSimilar = "del";
                        $("#inpAddSimilar").css({ "display": "inline-block" });
                        $("#bndAddSimilar").css({ "display": "none" });
                        $("#bndDelSimilar").css({ "display": "none" });
                        $("#bndRefreshSimilar").css({ "display": "none" });
                    });

                    //Update details
                    $('#inpAddSimilar').keyup(function (e) {
                        if (e.keyCode == 13) {
                            e.preventDefault()
                            var strNewArtists = $(this).val();
                            var strSimilarUrl = strGlobActiveSimilar == "del" ? "/Forms/SecondaryPage.aspx/DeleteSimilarArtists" : "/Forms/SecondaryPage.aspx/AddSimilarArtists";

                            $.ajax({
                                type: "POST",
                                async: false,
                                url: strSimilarUrl,
                                data: JSON.stringify({
                                    'strCurColor': currentColor,
                                    'strArtistNames': strNewArtists
                                }),
                                contentType: "application/json; charset=utf-8",
                                dataType: "json",
                                success: function (data) {
                                    $("#divContentSimilar").empty();
                                    $("#divContentSimilar").append(data.d.replaceAll("%27", "'"));
                                    $("#inpAddSimilar").css({ "display": "none" });
                                    $("#bndAddSimilar").css({ "display": "inline-block" });
                                    $("#bndDelSimilar").css({ "display": "inline-block" });
                                    $("#bndRefreshSimilar").css({ "display": "inline-block" });
                                    $("#inpAddSimilar").val("");
                                }
                            });
                        }
                    });

                    $("#bndRefreshSimilar").click(function () {
                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/SecondaryPage.aspx/RefreshSimilarArtists",
                            data: JSON.stringify({
                                'strCurColor': currentColor
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                //Add data
                                var result = data.d;
                                if (result != "") {
                                    $("#divContentSimilar").empty();
                                    $("#divContentSimilar").append(result.replaceAll("%27", "'"));
                                }
                            }
                        });
                    });

                    //Redirect to artist
                    $(".itemBoxRelated").click(function () {
                        var strClickedProject = $(this).attr("data-name");
                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/TertiaryPage.aspx/ArtistLookup",
                            data: JSON.stringify({
                                'strArtistName': strClickedProject
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                //If folder is found, then redirect
                                if (data.d.indexOf("https://") == -1) {
                                    setTimeout(function () {
                                        window.location.replace("/Media/Music/" + data.d);
                                    }, 300);
                                }

                                //if not found look into wikipedia/google
                                else {
                                    window.open(data.d, "_blank");
                                }
                            }
                        })

                    });
                    $(".subfilterOption:first").click();
                }
                else {
                    $(".subfilterOption:first").click();
                }
            }
        });
    }
});

//Search field
$("#SubFilterOptSec").keyup(function (event) {
    //if page is not release (third)
    if (document.querySelectorAll('.colorImage').length == 0) {
        var key = event.keyCode || event.which;
        if (key === 13) {
            event.preventDefault();
        }
        else if ($(this).val().length > 1) {
            $('#lstSearchFilterSec').empty();
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/GetSearchFilter",
                data: JSON.stringify({
                    'strName': $(this).val(),
                    'strTable': 'bands',
                    'strContentID': '',
                    'strParent' : ''
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    $('#lstSearchFilterSec').empty().append(data.d);
                }
            });
        }
        else {
            $('#lstSearchFilterSec').empty();
        }

    }
    //If release page, pressing enter
    else if (event.keyCode == 13) {
        event.preventDefault();
        var strValue = $(this).val();

        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
            data: JSON.stringify({
                'strSession1': "",
                'strSession2': "Return",
                'strSession3': "",
                'strSession4': "",
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                var sessionVariables = data.d.split(";");
                setTimeout(function () {
                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
                }, 300);

            }
        });
    }
});

//Clickable Box Set rows
$(".rowBoxSet").click(function () {
    var strValue = $(this).attr("data-filename");

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': "",
            'strSession2': "Return",
            'strSession3': "",
            'strSession4': "",
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            var sessionVariables = data.d.split(";");
            setTimeout(function () {
                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
            }, 300);

        }
    });
});


$("#SubFilterOptSec").on('input', function () {
    var val = this.value;
    var code = "";
    if ($('#lstSearchFilterSec option').filter(function () {
        return this.value.toUpperCase() === val.toUpperCase();
    }).length) {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
            data: JSON.stringify({
                'strSession1': this.value,
                'strSession2': 'bands',
                'strSession3': "0",
                'strSession4': "",
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                var sessionVariables = data.d.split(";");
                setTimeout(function () {
                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);

                }, 500);

            }
        });
    }
});

//Events on key up to switch images
$(document).on('keyup', function (e) {
    if (e.which == 37) {
        // $("#imgLeftButton").click();
    }
});

$(document).on('keyup', function (e) {
    if (e.which == 39) {
        //$("#imgRightButton").click();
    }
});


//Edit display
$("#bndEdit").on('click', function () {
    $(this).css("display", "none");
    $("#bndRefreshTop").css("display", "none");
    $("#divContainer").css("visibility", "hidden");
    $("#divEditSection").css("display", "inline-block");
    $("#bndSave").css("display", "block");
    $("#divTopTracks").css("visibility", "hidden");
    $("#divPlayer").css("visibility", "hidden");
});

//Save
var intCountURL = 0;
$("#bndAddUrl").on('click', function () {
    var row = "<input runat='server' id='BndGenreURLNew_" + intCountURL + "' type='text' class='form-control inputFieldTertiary dark-mode-secondary-page bndDataField bndURLFieldNew bndURL' placeholder='URL Name: URL link'/>";
    $('#bndLineURL').append(row);
    intCountURL++;
});


$("#bndSave").on("click", function () {
    $(this).css("display", "none");
    $("#divContainer").css("visibility", "visible");
    $("#divEditSection").css("display", "none");
    $("#bndEdit").css("display", "block");
    $("#bndRefreshTop").css("display", "block");
    $("#divTopTracks").css("visibility", "visible");
    $("#divPlayer").css("visibility", "visible");


    var strData = "2>bndCode@" + $("#bndID").val() + "^" +
        "1>bndName@" + $("#bndName").val() + "^" +
        "3>bndOtherNames@" + $("#bndAlias").val() + "^" +
        "4>bndOriginPlace@" + $("#bndCity").val() + "^" +
        "5>bndFKcountries@" + $("#bndCountry").val() + "^" +
        "6>bndStartingDates	@" + $("#bndStartDates").val() + "^" +
        "7>bndEndingDates@" + $("#bndEndDates").val() + "^" +
        "10>bndFKsubgenres@" + $("#bndGenres").val() + "^" +
        "13>bndFKimages@" + $("#bndAbout").val();

    var strURLOld = "";

    for (var i = 0; i < document.querySelectorAll('.bndURLField').length; i++) {
        strURLOld = $("#BndGenreURL_" + i).val() != "" ? strURLOld + "[" + $("#BndGenreURL_" + i).val() + "]^" : strURLOld;
    }

    strURLOld = strURLOld.slice(0, -1);

    var strURLNew = "";

    for (var i = 0; i < document.querySelectorAll('.bndURLFieldNew').length; i++) {
        strURLNew = $("#BndGenreURLNew_" + i).val() != "" ? strURLNew + "[" + $("#BndGenreURLNew_" + i).val() + "]^" : strURLNew;
    }

    strURLNew = strURLNew.slice(0, -1);


    //Artist Participation CRUD
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/SecondaryPage.aspx/UpdateArtistData",
        data: JSON.stringify({
            'strData': strData,
            'strURLOld': strURLOld,
            'strURLNew': strURLNew
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            if (data.d != "") {
                var strArray = data.d.split("^");
                alert("Warning! You've modified the band name, please, close this page and change the music folder name from " + strArray[0] + " to " + strArray[1] + ".");
                window.location.replace("/Media/Music");
            }
        }
    });
});
//Refresh top tracks
$("#bndRefreshTop").click(function () {
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/SecondaryPage.aspx/RefreshTopTracks",
        data: JSON.stringify({
            'strCurColor': currentColor
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            if (data.d != "") {
                $(".coloredText").css({ "color": currentColor });
                var result = data.d;
                if (result != "") {
                    $(".aPause").click();
                    $("#player").attr("src", "");
                    player.currentTime = 0;
                    progressBar.value = 0;
                    $("#divTopTracks").empty();
                    $("#divTopTracks").append(result.split("^")[0].replaceAll("%27", "'"));
                    $("#txtTopTrackPaths").val(result.split("^")[1]);
                    $("#divTopTracks").css({
                        "display": "block"
                    });

                    $('.imgTopTrack:first').addClass("firstTrack");
                    $('.imgTopTrack:last').addClass("lastTrack");


                    $(".divSubContentSpan").click(function () {
                        $(".imgTopTrack").removeClass("activeTrack");
                        $(".imgTopTrack").css({ "border": "0px solid transparent" });
                        $(this).siblings(".imgTopTrack").addClass("activeTrack");
                        var strValue = $(this).children(".aTopTrack").attr("data-path");
                        strPlaying = 1;
                        $("#player").attr("src", strValue);
                        $(".aPause").css({ 'display': 'block' });
                        $(".aPlay").css({ 'display': 'none' });
                        document.getElementById('player').play();
                        //add color frame to picture
                        $(".activeTrack").css({ "border": "1px solid " + currentColor });
                        $(".hp_range").css({ "background-color": currentColor });
                    });

                    //Go to album page
                    $(".imgTopTrack").click(function () {
                        var strReleaseName = $(this).attr("data-value");
                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                            data: JSON.stringify({
                                'strSession1': strReleaseName,
                                'strSession2': "curReleaseName",
                                'strSession3': "",
                                'strSession4': "",
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                //redirect to page 3
                                var sessionVariables = data.d.split(";");
                                setTimeout(function () {
                                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strReleaseName.slice(12).replace('.', '·').replace("&", "¿"));

                                }, 500);

                            }
                        });
                    });
                }
            }
        }
    });
});

$(".relProject").click(function () {
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': $(this).text(),
            'strSession2': $(this).attr("data-code"),
            'strSession3': $(this).attr("data-id") + "_Link_Click",
            'strSession4': "",
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            var sessionVariables = data.d.split(";");
            setTimeout(function () {
                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
            }, 300);

        }
    });
});

$(".simProject").click(function () {
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': $(this).text(),
            'strSession2': $(this).attr("data-code"),
            'strSession3': $(this).attr("data-id") + "_Link_Click",
            'strSession4': "",
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            var sessionVariables = data.d.split(";");
            setTimeout(function () {
                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
            }, 300);

        }
    });
});

$(".aBandPage").click(function () {
    var strCurArtist = typeof $(this).attr("data-value") == "undefined" ? "" : $(this).attr("data-value");
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': strCurArtist,
            'strSession2': "Return",
            'strSession3': "",
            'strSession4' : "",
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {

            if (data.d.indexOf("https") >= 0) {
                window.open(data.d, "_blank")
            }
            else {
                var sessionVariables = data.d.split(";");
                setTimeout(function () {
                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                }, 300);
            }
        }
    });
});


$(".aAlbumPage").click(function () {
    var strValue = $(this).attr("data-value");
    var strIsSingleBox = "";
    if ($(this).hasClass("isSingleBox")) {
        strIsSingleBox = "yes";
    }
    var strSess1 = "";
    var strSess2 = "Return";
    var strSess3 = "";

    if (strValue.indexOf('|') > -1) {
        strSess1 = "userplaylist" + strValue.split("|")[1];
        strSess2 = "userplaylist";
        strSess3 = "01.01.1000. " + strValue.split("|")[2];
        strValue = strValue.split("|")[2];
    }
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': strSess1,
            'strSession2': strSess2,
            'strSession3': strSess3,
            'strSession4': strIsSingleBox
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            var sessionVariables = data.d.split(";");
            setTimeout(function () {
                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
            }, 300);

        }
    });
});

$(".aAlbumPageAnchor").click(function () {
    var strNewArtistID = typeof $(this).attr("data-newartist") != 'undefined' ? $(this).attr("data-newartist") : "";
    var strValue = $(this).text();
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': strNewArtistID,
            'strSession2': "Return",
            'strSession3': "",
            'strSession4': "no",
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            var sessionVariables = data.d.split(";");
            setTimeout(function () {
                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
            }, 300);

        }
    });
});

$('.videoRow').on("click", function () {
    var strVideoPath = ($(this).attr("data-webpath"));
    if (strVideoPath != "") {
        $(".aPause").click();
        window.open(strVideoPath, "_blank")
    }
});


//Add to playlist
$("#butPlaylist").click(function () {
    var strItemPath = $(".selectedTrack").attr("data-webpath");
    if (strItemPath != "") {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
            data: JSON.stringify({
                'strSession1': $(".selectedTrack").attr("data-webpath"),
                'strSession2': "ItemPath",
                'strSession3': currentColor,
                'strSession4': "",
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {

                setTimeout(function () {
                    $("#modalPlaylistDataDiv").click();
                }, 300);

            }
        });
    }
});


$('.artistRef').on("click", function () {
    var strArtistName = ($(this).text());

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/TertiaryPage.aspx/ArtistLookup",
        data: JSON.stringify({
            'strArtistName': strArtistName
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            //If folder is found, then redirect
            if (data.d.indexOf("https://") == -1) {
                setTimeout(function () {
                    window.location.replace("/Media/Music/" + data.d);
                }, 300);
            }

            //if not found look into wikipedia/google
            else {
                window.open(data.d, "_blank");
            }
        }
    })
})

//Player (release)
$('.trackRow:first').addClass("firstTrackRow");
$('.trackRow:last').addClass("lastTrackRow");

var strPlaying = 0;

player.addEventListener("timeupdate", function () {
    var currentTime = player.currentTime;
    var duration = player.duration;
    $('.hp_range').stop(true, true).animate({ 'width': (currentTime + .25) / duration * 100 + '%' }, 250, 'linear');
});

player.addEventListener('ended', function () {
    var strWebPath = $('.divSubContentSpan').length > 0 ? $(".activeTrack").siblings(".divSubContentSpan").children(".aTopTrack").attr("data-path") : $(".selectedTrack").attr("data-webpath");
    strWebPath = strWebPath == null ? $('.divSubContentSpan').length > 0 ? $(".activeMainTrack").attr("data-webpath") : $(".selectedTrack").attr("data-webpath") : strWebPath;
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/TertiaryPage.aspx/SaveReproduction",
        data: JSON.stringify({
            'strTrackPath': strWebPath
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            if ($(".selectedTrack").hasClass("lastTrackRow")) {
                $(".firstTrackRow").click();
            }
            //else if ($('.divSubContentSpan').length > 0) {
            //    $(".divNextTrackSec").click();
            //}
            else {
                if ($(".selectedTrack").nextAll(".row:first").hasClass("videoRow")) {
                    $(".selectedTrack").nextAll(".row:first").nextAll(".row:first").click();
                }
                else {
                    $(".selectedTrack").nextAll(".row:first").click();
                }
            }
        }
    });
});

progressBarBack.addEventListener("click", seek);

function seek(e) {
    var percent = e.offsetX / this.offsetWidth;
    player.currentTime = percent * player.duration;
    progressBar.value = percent / 100;
}

$(".aPlay").click(function () {
    strPlaying = 1;
    if (strTabClick == 0) {
        $(".aPause").css({ 'display': 'block' });
        $(".aPlay").css({ 'display': 'none' });
        $("#imgDisc").css({ 'animation': 'rotation 5s infinite linear' });
        if (strCurrentAudio == "") {
            if (intVersionClickCheck != 0) {
                $(".trackRowVersion").first().click();
            }
            else if ($('.trackRow').length > 0) {
                $(".trackRow").first().click();
            }
            else if ($('.divSubContentSpan').length > 0) {

            }
        }

        else if (strCurrentAudio != strNewAudio) {
            $("#player").attr("src", strCurrentAudio);
        }

        strNewAudio = strCurrentAudio;

        document.getElementById('player').play();
    }

});

$(".aPause").click(function () {
    if (strPlaying == 1) {
        strPlaying = 0;
        $("#imgDisc").css({ 'animation': 'rotation 0s infinite linear' });;
        $(".aPause").css({ 'display': 'none' });
        $(".aPlay").css({ 'display': 'block' });
        document.getElementById('player').pause();
    }
});

$(".divPrevTrack").on('click', function () {
    if (strGlobActiveSection == "Versions") {
        $('#divContainerVersions').css("visibility", "visible");
        $('#divContainerTracks').css("visibility", "hidden");
        $('.butReturnTracklist').css("display", "none");
        $('#butReturnTracklistVer').css("display", "block");
        strGlobActiveSection = "";
        strGlobActiveLyrics = "";
    }
    else {
        $("#divContainerVersions").html("");
        $('#divContainerTracks').css("visibility", "visible");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#butVersions').css("display", "block");
        $('.butReturnTracklist').css("display", "none");
    }

    $('#divContainerLyrics').css("visibility", "hidden");
    $('#butLyrics').css("display", "block");

    if ($(".selectedTrack").hasClass("firstTrackRow") || $(".selectedTrack").hasClass("firstTrackRowVersion")) {
        if (intVersionClickCheck != 0) {
            $(".lastTrackRowVersion").click();
        }
        else {
            $(".lastTrackRow").click();
        }
    }
    else {
        if ($(".selectedTrack").prevAll(".row:first").hasClass("videoRow")) {
            $(".selectedTrack").prevAll(".row:first").prevAll(".row:first").click();
        }
        else {
            $(".selectedTrack").prevAll(".row:first").click();
        }

    }
});

$(".divNextTrack").on('click', function () {
    $("#divContainerLyrics").html("");

    if (strGlobActiveSection == "Versions") {
        $('#divContainerVersions').css("visibility", "visible");
        $('#divContainerTracks').css("visibility", "hidden");
        $('.butReturnTracklist').css("display", "none");
        $('#butReturnTracklistVer').css("display", "block");
        strGlobActiveSection = "";
        strGlobActiveLyrics = "";
    }
    else {
        $("#divContainerVersions").html("");
        $('#divContainerTracks').css("visibility", "visible");
        $('#divContainerVersions').css("visibility", "hidden");
        $('#butVersions').css("display", "block");
        $('.butReturnTracklist').css("display", "none");
    }

    $('#divContainerLyrics').css("visibility", "hidden");
    $('#butLyrics').css("display", "block");

    if ($(".selectedTrack").hasClass("lastTrackRow") || $(".selectedTrack").hasClass("lastTrackRowVersion")) {
        if (intVersionClickCheck != 0) {
            $(".firstTrackRowVersion").click();
        }
        else {
            $(".firstTrackRow").click();
        }
    }
    else {
        if ($(".selectedTrack").nextAll(".row:first").hasClass("videoRow")) {
            $(".selectedTrack").nextAll(".row:first").nextAll(".row:first").click();
        }
        else {
            $(".selectedTrack").nextAll(".row:first").click();
        }

    }
});

$(".divNextTrackSec").on('click', function () {

    if ($(".activeTrack").hasClass("lastTrack")) {
        $(".firstTrack").siblings(".divSubContentSpan").click();
    }
    else {
        $(".activeTrack").parent(".divTopTrack").nextAll(".divTopTrack:first").children(".divSubContentSpan").click();
    }
});

$(".divPrevTrackSec").on('click', function () {

    if ($(".activeTrack").hasClass("firstTrack")) {
        $(".lastTrack").siblings(".divSubContentSpan").click();
    }
    else {
        $(".activeTrack").parent(".divTopTrack").prevAll(".divTopTrack:first").children(".divSubContentSpan").click();
    }
});

//Keyboard controls
$(document).on('keyup', function (e) {

    if (strGlobActive == "Tracklist") {
        if (e.which == 32) {
            if (strPlaying == 1) {
                $(".aPause").click();
            }
            else {
                $(".aPlay").click();
            }
        }
        else if (e.which == 37) {
            $(".divPrevTrack").click();
        }

        else if (e.which == 39) {
            $(".divNextTrack").click();
        }
    }

    else if ($('.divSubContentSpan').length > 0) {
        if (e.which == 32) {
            if (strPlaying == 1) {
                $(".aPause").click();
            }
            else {
                $(".aPlay").click();
            }
        }
        else if (e.which == 37) {
            $(".divPrevTrackSec").click();
        }

        else if (e.which == 39) {
            $(".divNextTrackSec").click();
        }
    }
});

$("#butVideos").click(function () {
    $(".aPause").click();
});

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return parseInt(result[1], 16) + "," + parseInt(result[2], 16) + "," + parseInt(result[3], 16);
}

//Update details
$('.relEditField').keyup(function (e) {
    if (e.keyCode == 13) {
        e.preventDefault()
        var strRelGenres = $("#fieldRelGenres").val();
        var strRelLabel = $("#fieldRelLabel").val();
        var strRelProducer = $("#fieldRelProducer").val();

        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/TertiaryPage.aspx/UpdateReleaseDetails",
            data: JSON.stringify({
                'strRelGenres': strRelGenres,
                'strRelLabel': strRelLabel,
                'strRelProducer': strRelProducer,
                'strCurGenres': $("#txtRelGenres").val(),
                'strCurLabel': $("#txtRelLabel").val(),
                'strCurProducers': $("#txtRelProducers").val()
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                setTimeout(function () {
                    location.reload();
                }, 300);
            }
        });
    }
});

//Update writers
$('#txtWriterField').keyup(function (e) {
    if (e.keyCode == 13) {
        e.preventDefault()
        var strRelWriters = $(this).val();
        var strTrackTitle = strGlobReleaseName;

        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/TertiaryPage.aspx/UpdateTrackWriters",
            data: JSON.stringify({
                'strTrackTitle': strTrackTitle,
                'strTrackWriters': strRelWriters
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                //Replace content
                $("#traWriters").css({ 'display': 'block' });
                $("#txtWriterField").css({ 'display': 'none' });
                $("#traWriters").empty();
                $("#traWriters").html(data.d.split(';')[1].replaceAll("¿", ";").replaceAll("current_color", currentColor));

                //Click on writer to redirect
                $(".spaWriterName").click(function () {
                    var strNewArtistID = $(this).text();
                    var strValue = $(this).attr("data-href");
                    if (strValue.indexOf("https://") == -1) {
                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                            data: JSON.stringify({
                                'strSession1': strNewArtistID,
                                'strSession2': "bands",
                                'strSession3': "",
                                'strSession4': "",
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                var sessionVariables = data.d.split(";");
                                setTimeout(function () {
                                    window.location.replace("/Media/Music/" + strValue.replace("&", "¿"));
                                }, 300);

                            }
                        });
                    }
                    else {
                        window.open(strValue, "_blank");
                    }
                });
            }
        });
    }
});

//Click to edit release details
$(".pEditAttr").on("click", function () {
    $(".pEditAttr").css({ 'display': 'none' });
    $(".anchorProd").css({ 'display': 'none' });
    $(".relEditField").css({ 'display': 'table' });
});

//Exit edition fields
$('.relEditField').keyup(function (e) {
    if (e.keyCode == 27) {
        e.preventDefault()
        $(".pEditAttr").css({ 'display': 'table' });
        $(".anchorProd").css({ 'display': 'table' });
        $(".relEditField").css({ 'display': 'none' });
    }
});

$('.pSpaAlbum').click(function (e) {
    $(".pEditAttr").css({ 'display': 'table' });
    $(".anchorProd").css({ 'display': 'table' });
    $(".relEditField").css({ 'display': 'none' });
});

$('.spaTrackData').click(function (e) {
    $("#txtWriterField").css({ 'display': 'none' });
    $("#traWriters").css({ 'display': 'block' });
});

$(document).ready(function () {

    //Style select2 options
    function iformat(data, container) {
        $(container).css('color', 'rgba(240, 248, 255, 1)');
        $(container).css('font-size', '12px');
        $(container).css('background-color', 'rgba(0, 0, 0, 0.9)');
        $(container).css('overflow-x', 'hidden');
        $(container).css('white-space', 'nowrap');
        $(container).css('width', 'auto');
        if (data.text != "No shows found during this year" && data.text.length > 4) {
            $(container).css('width', '650px');
            $(container).css('padding-right', '30px');
            return $('<span data-country="' + data.text.split(';')[0] + '" class="customOption setlistShow" data-setlist="' + data.text.split(';')[3] + '" data-showdate="' + data.text.split(';')[4] + '" id="' + data.text.split(';')[1] + '"><img src="/Images/Flags/' + data.text.split(';')[0].toLowerCase() + '.svg" class="img-flag" width="15px" style="margin-top:-5px"/>  ' + data.text.split(';')[2] + '</span>');
        }
        else if (data.text == "No shows found during this year") {
            $(container).css('width', '650px');
            $(container).css('padding-right', '30px');
            return $('<span data-year="' + data.text + '" class="customOption setlistYear" id="yr' + data.text + '">' + data.text + '</span>');;
        }
        else {
            return $('<span data-year="' + data.text + '" class="customOption setlistYear" id="yr' + data.text + '">' + data.text + '</span>');;
        }
    }

    function selectedformat(data, container) {
        $(container).css('color', 'rgba(240, 248, 255, 1)');
        $(container).css('font-size', '12px');
        $(container).css('font-weight', 'normal');
        $(container).css('background-color', 'rgba(0, 0, 0, 0)');
        $(container).css('overflow-x', 'hidden');
        $(container).css('white-space', 'nowrap');
        $(container).css('width', 'auto');
        if (data.text != "No shows found during this year" && data.text.length > 4) {
            $(container).css('width', '650px');
            $(container).css('padding-right', '30px');
            return $('<span data-country="' + data.text.split(';')[0] + '" class="customOption setlistShow" data-setlist="' + data.text.split(';')[3] + '" data-showdate="' + data.text.split(';')[4] + '" id="' + data.text.split(';')[1] + '"><img src="/Images/Flags/' + data.text.split(';')[0].toLowerCase() + '.svg" class="img-flag" width="15px" style="margin-top:-5px"/>  ' + data.text.split(';')[2] + '</span>');
        }
        else if (data.text == "No shows found during this year") {
            $(container).css('width', '650px');
            $(container).css('padding-right', '30px');
            return $('<span data-year="' + data.text + '" class="customOption setlistYear" id="yr' + data.text + '">' + data.text + '</span>');;
        }
        else {
            return $('<span data-year="' + data.text + '" class="customOption setlistYear" id="yr' + data.text + '">' + data.text + '</span>');;
        }
    }

    $('.select2').select2({
        multiple: false,
        minimumResultsForSearch: 1,
        templateSelection: selectedformat,
        templateResult: iformat,
        selectOnClose: false,
        width: '100%'
    });

    $(".select2").change(function () {
        var selItem = $(this).find(":selected").text();
        var selSetlist = selItem.split(';')[3];
        strGlobShowDate = selItem.split(';')[4];
        //Switch year
        if (typeof selSetlist == 'undefined') {
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                data: JSON.stringify({
                    'strSession1': "SetlistPlaylist",
                    'strSession2': selItem,
                    'strSession3': "",
                    'strSession4': "",
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    setTimeout(function () {
                        location.reload();
                    }, 300);
                }
            });
        }
        //Switch setlist
        else {
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/TertiaryPage.aspx/GetPlaylistTracklist",
                data: JSON.stringify({
                    'strPlaylistTracks': selSetlist.replaceAll("^", ";"),
                    'strCurReleaseName': "01.01.1000. Setlists",
                    'strUserPlaylist': "false",
                    'strIsArtistPlaylist': "1",
                    'strSkipContainer': "1",
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    var trackList = data.d.split('®')[0];
                    $("#trackListContents").html("");
                    $("#trackListContents").html(trackList);

                    $('.trackRow').on("mouseover", function () {
                        $(this).css({ "padding-right": "-15px" });
                        $(this).children(".controlWrapper").children(".controlTrack").css({ "display": "block" });
                        $(this).children(".controlWrapper").children(".numberTrack").css({ "display": "none" });

                        if (!$(this).hasClass("activeTer")) {
                            $(this).css({
                                "border-bottom": "1px solid " + currentColor,
                                "border-top": "1px solid " + currentColor,
                                "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                                "background-color": "rgba(0, 0, 0, 0.5)"
                            });
                        }

                    });

                    $('.trackRow').on("mouseleave", function () {
                        $(this).css({ "padding-right": "15px" });
                        $(this).children(".controlWrapper").children(".controlTrack").css({ "display": "none" });
                        $(this).children(".controlWrapper").children(".numberTrack").css({ "display": "block" });

                        if (!$(this).hasClass("activeTer")) {
                            $(this).css({
                                "background-color": "rgba(0, 0, 0, 0)",
                                "border-bottom": "0",
                                "border-top": "0",
                                "text-shadow": "0 0"
                            });
                        }
                    });


                    $('.trackRow').on("click", function () {
                        if ($(this).hasClass("promoMaterialRow")) {
                            isPromoRelease = "Promo Release";
                        }
                        $(".trackRow").removeClass("selectedTrack");
                        $(".trackRowVersion").removeClass("selectedTrack");
                        strCurrentAudio = $(this).attr("data-webpath").replaceAll(".lnk", "");
                        if (strTabClick == 1 && strGlobTrackClick == 0) {
                            strTabClick = 0;
                            strGlobTrackClick == 1;
                        }
                        if (strTabClick != 1) {
                            $(".aPlay").click();
                        }
                        else {
                            strTabClick = 0;
                        }
                        intVersionClickCheck = 0;
                        $(this).addClass("selectedTrack");

                        strGlobActiveSection = "";
                        if (currentColor != "") { //if (!$(this).hasClass("activeMainTrack")) {
                            if (strGlobLabel == "No") {
                                $("#divTrackDetails").css({ "margin-top": "-150px" });
                            }
                            else if (strGlobalTracklist == "no" && $(this).attr("data-webpath").includes('/Various Artists/')) {
                                $("#divTrackDetails").css({ "margin-top": "-185px" });
                            }
                            else if (strGlobalTracklist == "no") {
                                $("#divTrackDetails").css({ "margin-top": "-205px" });
                            }
                            else {
                                $("#divTrackDetails").css({ "margin-top": "-20px" });
                            }

                            $(".trackRow").removeClass("activeMainTrack");
                            $(this).addClass("activeMainTrack");


                            $('.trackRow').css({
                                "background-color": "rgba(0, 0, 0, 0)",
                                "border-bottom": "0",
                                "border-top": "0",
                                "text-shadow": "0 0"
                            });

                            if (!$(this).hasClass("activeTer")) {
                                $(this).css({
                                    "border-bottom": "1px solid " + currentColor,
                                    "border-top": "1px solid " + currentColor,
                                    "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                                    "background-color": "rgba(0, 0, 0, 0.5)"
                                });
                            }

                            $('.trackRow').removeClass("activeTer");
                            $(this).addClass("activeTer");

                            //Variable Definition
                            var strReleaseType = $(".pSpaType").text().replaceAll(" by ", "");
                            var strWebPath = $(this).attr("data-webpath");
                            let pathSegments = strWebPath.split("/");
                            let pathFolderName = pathSegments[8];
                            let pathSubFolderName = pathSegments[9];
                            let releaseTitle = typeof pathFolderName != 'undefined' && pathFolderName.length > 12 ? pathFolderName.substring(12) : pathFolderName;
                            let subReleaseTitle = typeof pathSubFolderName != 'undefined' && pathSubFolderName.length > 12 ? pathSubFolderName.substring(12) : typeof pathSubFolderName != 'undefined' ? pathSubFolderName : "";
                            let originalReleaseType = typeof pathFolderName != 'undefined' ? pathSegments[7].slice(0, -1) : strReleaseType;
                            var strFullName = $(this).attr("data-fullname");
                            var strFeatures = $(this).attr("data-feat");
                            var strTrackType = $(this).attr("data-tracktype");
                            var strCovers = $(this).attr("data-cover");
                            var strOtherData = $(this).attr("data-other");
                            var strEdition = $(this).attr("data-edition");
                            var strEditionDate = $(this).attr("data-editionDate");
                            var strDiscFullName = $(this).attr("data-disc");
                            var strSinglesPath = $("#txtSinglesPath").val();
                            strAltDiscPath = "";
                            strGlobCurrentEdition = $(this).attr("data-edition");
                            var strOriginalArtist = typeof $(this).attr("data-performingArtist") != 'undefined' ? $(this).attr("data-performingArtist") : "";
                            var strWritingCredits = $("#txtWriters").val() != "" ? $("#txtWriters").val() : typeof $(this).attr("data-writer") != 'undefined' ? $(this).attr("data-writer") : "";
                            var strBSide = $(this).attr("data-singlecontainer") ?.replaceAll("%27", "\'");
                            var strTourTitle = typeof $(this).attr("data-tour") != 'undefined' ? $(this).attr("data-tour") : "";

                            //If it's a video of a series
                            if (strFeatures == "series_row" || strWebPath.indexOf("youtube") > 0) {
                                window.open(strWebPath, "_blank");
                            }
                            else {
                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/TertiaryPage.aspx/TrackClick",
                                    data: JSON.stringify({
                                        'strWebPath': strWebPath,
                                        'strFullName': strFullName,
                                        'strFeatures': strFeatures,
                                        'strTrackType': strTrackType,
                                        'strCovers': strCovers,
                                        'strOtherData': strOtherData,
                                        'strEdition': strEdition,
                                        'strEditionDate': strEditionDate,
                                        'strDiscFullName': strDiscFullName,
                                        'strSinglesPath': strSinglesPath,
                                        'strVersion': "",
                                        'strOriginalArtist': strOriginalArtist,
                                        'strWritingCredits': strWritingCredits,
                                        'strPlaylist': strGlobIsPlaylist
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {
                                        var strData = data.d.split(";");
                                        if (strData[strData.length - 1].includes('Canvas')) {
                                            if ($("#canvasSource").attr("src") != strData[strData.length - 1]) {
                                                $("#canvasSource").attr("src", strData[strData.length - 1]);
                                                $("#vidCanvas")[0].load();
                                            }
                                            strData.pop();
                                        }
                                        else {
                                            $("#canvasSource").attr("src", "");
                                            $("#vidCanvas")[0].load();
                                        }
                                        if (strData[strData.length - 1].includes('non_available')) {
                                            $("#canvasSource").attr("src", "");
                                            $("#vidCanvas")[0].load();
                                            strData.pop();
                                        }
                                        if (strData[strData.length - 1].includes('AltDiscPath_')) {
                                            strAltDiscPath = strData[strData.length - 1].replaceAll("AltDiscPath_", "");
                                            strData.pop();
                                        }
                                        if (strData[strData.length - 2].includes('AltDiscPath_')) {
                                            strAltDiscPath = strData[strData.length - 2].replaceAll("AltDiscPath_", "");
                                            strData.splice(strData.length - 2, 1);
                                        }

                                        $("#imgCover").attr("src", strData[0]);
                                        $("#imgDisc").attr("src", strData[1]);
                                        $("#imgAltDisc").attr("src", strAltDiscPath);

                                        if ($("#vidSource").attr("src") != strData[3] || strData[0].includes("05. Singles [Music]")) {
                                            if (!strData[0].includes("05. Singles [Music]")) {
                                                $("#vidSource").attr("src", strData[3]);
                                            }
                                            else {
                                                $("#vidSource").attr("src", "");
                                            }
                                            $("#vidCover")[0].load();
                                        }

                                        var strReleaseName = strData[4];
                                        var strTraDate = strData[5];
                                        var strYouTubeLink = strData[7];
                                        var strNewArtistID = typeof strData[8] != 'undefined' ? strData[8] : "";
                                        var strOriginalArtist = typeof strData[9] != 'undefined' ? strData[9] : "";
                                        var strWriters = typeof strData[10] != 'undefined' ? strData[10] : "";
                                        var strWritersPlain = typeof strData[11] != 'undefined' ? strData[11] : "";
                                        var strWritersFullField = typeof strData[12] != 'undefined' ? strData[12] : "";

                                        $('body').css('background-image', 'url("' + strData[2].replaceAll("\\", "/") + '")');

                                        $.ajax({
                                            type: "POST",
                                            async: false,
                                            url: "/Forms/SecondaryPage.aspx/GetProminentColor",
                                            data: JSON.stringify({
                                                'strPath': strData[2]
                                            }),
                                            contentType: "application/json; charset=utf-8",
                                            dataType: "json",
                                            success: function (data) {
                                                currentColor = data.d;
                                                $(".activeSec").css({
                                                    "border-bottom": "1px solid " + currentColor,
                                                    "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor
                                                });
                                                $(".coloredText").css({ "color": currentColor });
                                                $('.colorImage').css({ "filter": "drop-shadow(0px 0px 5px " + currentColor + ")" });

                                                $(".activeTer").css({
                                                    "border-bottom": "1px solid " + currentColor,
                                                    "border-top": "1px solid " + currentColor,
                                                    "text-shadow": "0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px " + currentColor + ", 0 1px 10px" + currentColor,
                                                    "background-color": "rgba(0, 0, 0, 0.5)"
                                                });

                                                if (strOriginalArtist != "") {
                                                    strFullName = strFullName.replace("Performed by " + strOriginalArtist, "").replace(" by " + strOriginalArtist, "");
                                                }
                                                if (strFullName.includes(".mp4")) {
                                                    var datePrefixRegex = /^\d{4}\.\d{2}\.\d{2}\./;
                                                    var startsWithDatePrefix = datePrefixRegex.test(strFullName);
                                                    if (startsWithDatePrefix) {
                                                        strFullName = strFullName.substring(8);
                                                    }

                                                    strFullName = strFullName.replace(strFeatures, "").replace(strCovers, "").replace(";", "").replace(" []", "").replace(" [ ", " [").replace(" language version", " version");
                                                }
                                                else {
                                                    strFullName = strFullName.replace(strFeatures, "").replace(strCovers, "").replace(";", "").replace(" []", "").replace(" [ ", " [").replace(" language version", " version");
                                                }

                                                strFullName = strFullName.replace("[; ", "[");
                                                var strBracketContent = "";
                                                if (strFullName.indexOf("[") > 0) {
                                                    strBracketContent = strFullName.substring(strFullName.indexOf("[") + 1, strFullName.lastIndexOf("]"));
                                                }

                                                strBracketContent = strBracketContent != "" ? strBracketContent.replaceAll("%27", "\'").replaceAll("Performed by " + strOriginalArtist, "") : strOtherData.replace("Performed by " + strOriginalArtist, "");
                                                strFullName = strFullName.slice(4).substring(0, strFullName.length - 8).replaceAll("%27", "'").replaceAll("[", "(").replaceAll("]", ")");
                                                strFullName = strFullName.replaceAll("Performed by" + strOriginalArtist, "").replaceAll(" ()", "");
                                                strBracketContent = strBracketContent.replaceAll("Performed by" + strOriginalArtist, "").replaceAll(" ()", "");

                                                if (strOriginalArtist != "" && strFullName.includes(" (by " + strOriginalArtist + ")")) {
                                                    strFullName = strFullName.replaceAll(" (by " + strOriginalArtist + ")", "");
                                                    strBracketContent = strBracketContent.replaceAll("by " + strOriginalArtist, "");
                                                    strFullName = strBracketContent != "" ? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";
                                                }
                                                else if (strOriginalArtist != "" && strBracketContent != "" && (strBracketContent.includes(" by ") || strBracketContent.includes("by "))) {
                                                    strBracketContent = strBracketContent.replaceAll(" by " + strOriginalArtist + "").replaceAll("by " + strOriginalArtist + "");
                                                    strFullName = typeof strBracketContent != "undefined" && strBracketContent != "" && strBracketContent != "undefined" ? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";
                                                }
                                                else {
                                                    strFullName = strBracketContent != "" ? "<span>" + strFullName.replace("(" + strBracketContent + ")", "") + " </span><span style='font-size:10px'>(" + strBracketContent + ")</span><br>" : "<span>" + strFullName + "</span>";
                                                }


                                                //Original artist
                                                if (strOriginalArtist != "") {
                                                    //If it has tour
                                                    if (strTourTitle != "") {
                                                        strOriginalArtist = "<span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strTourTitle + "</span>"
                                                    }
                                                    else {
                                                        strOriginalArtist = "<span>Performed by </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strOriginalArtist + "</span>"
                                                    }
                                                }

                                                //>2 features
                                                if (strFeatures != "" && strFeatures.indexOf(" & ") > 0 && strFeatures.indexOf(",") > 0) {

                                                    var strFeatureArray = strFeatures.split(',');
                                                    for (var i = 0; i < strFeatureArray.length; ++i) {

                                                        if (i == 0) {
                                                            strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[i].replace("feat. ", "") + "</span>";
                                                        }

                                                        else if (strFeatureArray[i] != "" && strFeatureArray[i].indexOf(" & ") > 0) {
                                                            var strFeatureArray2 = strFeatureArray[i].split('&');
                                                            strFeatures = strFeatures + "<span>, </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray2[0] + "</span>" +
                                                                "<span>& </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray2[1] + "</span>" + "<br>";
                                                        }

                                                        else {
                                                            strFeatures = strFeatures + "<span>, </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[i] + "</span>";
                                                        }
                                                    }
                                                }

                                                //2 features
                                                else if (strFeatures != "" && strFeatures.indexOf(" & ") > 0) {
                                                    var strFeatureArray = strFeatures.split('&');
                                                    strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[0].replace("feat. ", "") + "</span>" +
                                                        "<span>and </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatureArray[1] + "</span>" + "<br>";
                                                }

                                                //1 feature
                                                else if (strFeatures != "") {
                                                    strFeatures = "<span>Featuring </span><span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strFeatures.replace("feat. ", "") + "</span><br>";
                                                }

                                                strEdition = strEdition != "" ? strEdition : strData[6].replaceAll(",", ";");
                                                strEdition = typeof strEdition != "undefined" ? strEdition : "";

                                                if (strEdition == "" && strDiscFullName != "") {
                                                    var strContent = strData[1].replace("//[Artwork]/" + strDiscFullName + ".png", "").replace("http://127.0.0.1:8887/", "");
                                                    var strContentArray = strContent.split('/');

                                                    var strCurRelease = strContentArray[4];
                                                    var strCurEdition = typeof strContentArray[5] != "undefined" && strContentArray[5].indexOf(" Edition") >= 0 ? strContentArray[5].substring(12) : "";
                                                    strEdition = strCurRelease;
                                                    if (strDiscFullName.indexOf("Disc ") >= 0) {
                                                        strDiscFullName = strCurEdition != "" ? strCurEdition + ", " + strDiscFullName : strDiscFullName;
                                                    }
                                                    else {
                                                        strDiscFullName = strCurEdition.replace("Standard Edition", "");
                                                    }

                                                    if (strDiscFullName != "" && strDiscFullName.match("^0")) {
                                                        // do this if begins with Hello
                                                        strDiscFullName = strDiscFullName.slice(4);
                                                    }
                                                    if (typeof strEdition != "undefined" && strEdition != "Albums" && strEdition != "Compilations" && strEdition != "Singles" && strReleaseType != "Compilation" && strEdition != "Live Records") {
                                                        strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span><span>, " + strDiscFullName + "</span>" : strEdition != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                                        $("#traRelease").html(strEdition);
                                                    }
                                                    else if (strReleaseType == "Compilation" && typeof strEdition !== "undefined") {
                                                        if (originalReleaseType != "Compilation") {
                                                            strEdition = "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + releaseTitle + "</span>";
                                                            $("#traRelease").html(strEdition);
                                                        }
                                                        else if (typeof strEdition !== "undefined") {
                                                            //strEdition = "<span>Previously Unreleased</span>";
                                                            $("#traRelease").html("");
                                                        }
                                                        else {
                                                            $("#traRelease").html("");
                                                        }
                                                    }
                                                    else if (typeof strEdition == "undefined") {
                                                        $("#traRelease").html("");
                                                    }
                                                    else if (typeof strEdition != "undefined" && strEdition == "Albums") {
                                                        $("#traRelease").html("");
                                                    }
                                                }

                                                else if (strEdition == "" && strDiscFullName == "" && strData[1] != null && strData[1].indexOf(".png") == -1) {
                                                    var strContent = strData[1].replace("//[Artwork]/Disc.png", "").replace("http://127.0.0.1:8887/", "");
                                                    var strContentArray = strContent.split('/');

                                                    var strCurRelease = strContentArray[4];
                                                    var strCurEdition = typeof strContentArray[5] != "undefined" && strContentArray[5].indexOf(" Edition") >= 0 ? strContentArray[5].substring(12) : "";
                                                    strEdition = strCurRelease;
                                                    strDiscFullName = strCurEdition.replace("Standard Edition", "");

                                                    strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span><span>, " + strDiscFullName + "</span>" : strEdition != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                                    $("#traRelease").html(strEdition);
                                                }
                                                else if (typeof strBSide != "undefined" && strBSide != "") {
                                                    strEdition = "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strBSide + "</span>";
                                                    $("#traRelease").html(strEdition);
                                                }

                                                else {
                                                    var intDiscIndex = 4
                                                    if (strDiscFullName.substring(0, 1) == ".") {
                                                        intDiscIndex = 8
                                                    }
                                                    else if (strReleaseType == "Compilation" && typeof strEdition !== "undefined") {
                                                        var sourceReleaseTitle = originalReleaseType == "Single" ? subReleaseTitle : releaseTitle;
                                                        if (originalReleaseType != "Compilation") {
                                                            strEdition = "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + sourceReleaseTitle + "</span>";
                                                            $("#traRelease").html(strEdition);
                                                        }
                                                        else if (typeof strEdition !== "undefined") {
                                                            //strEdition = "<span>Previously Unreleased</span>";
                                                            $("#traRelease").html("");
                                                        }
                                                        else {
                                                            $("#traRelease").html("");
                                                        }
                                                    }
                                                    else if (strNewArtistID != "" && strGlobIsPlaylist == "1") {
                                                        strEdition = strDiscFullName != "" ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" + "<span>, " + strDiscFullName.substring(intDiscIndex) + "</span>"
                                                            : strEdition.indexOf(".mp3 ") > 0 ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(intDiscIndex).replaceAll(".mp3", "").replaceAll(";", "").replaceAll(strBracketContent, "").replaceAll(" []", "") + "</span>"
                                                                : strEdition != "" && strEdition.indexOf("[") == -1 ? "<span>Taken from: </span><span class='coloredText aAlbumPageAnchor' data-newartist='" + strNewArtistID + "' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strEdition.substring(12) + "</span>" : "";
                                                        $("#traRelease").html(strEdition);
                                                    }
                                                    else {
                                                        strEdition = strDiscFullName != "" ? "Taken from: " + strEdition.substring(12) + ", " + strDiscFullName.substring(intDiscIndex) : strEdition.indexOf(".mp3 ") > 0 ? "Taken from: " + strEdition.substring(intDiscIndex).replaceAll(".mp3", "").replaceAll(";", "").replaceAll(strBracketContent, "").replaceAll(" []", "") : strEdition != "" && strEdition.indexOf("[") == -1 ? "Taken from: " + strEdition.substring(12) : "";
                                                        $("#traRelease").text(strEdition);
                                                    }
                                                }

                                                //strTraDate = strGlobalTracklist == "no" ? "Released on " + strTraDate : "";
                                                strTraDate = "Released on " + strTraDate;
                                                strGlobCoveredArtist = strCovers.replace(" cover", "").replace(/^\s+/, '');
                                                strCovers = strCovers != "" ? "<span class='coloredText artistLink artistFeat artistRef' style='text-decoration:none;cursor:pointer; font-weight:bold; color:" + currentColor + "'>" + strCovers.replace(" cover", "").replace(/^\s+/, '') + "</span><span> cover</span><br>" : "";
                                                strFullName = strFullName.replaceAll(";)<", ")<");
                                                $("#traTitle").html(strFullName);
                                                strGlobReleaseName = strFullName;
                                                $("#traOriginal").html(strOriginalArtist);
                                                $("#traWriters").html(strWriters.replaceAll("¿", ";").replaceAll("current_color", "aliceblue"));
                                                $("#txtWriterField").val(strWritersPlain);
                                                $("#txtWriters").val(strWritersFullField.replaceAll('¿', ';'));
                                                $("#traFeat").html(strFeatures);

                                                $("#traDate").text(strTraDate);
                                                $("#traCover").html(strCovers);

                                                $('#divTrackButtons').css("visibility", "visible");
                                                $('.butReturnTracklist').css("display", "none");

                                                //Toggle youtube video button
                                                if (strYouTubeLink != "") {
                                                    $('#divVideos').css("visibility", "visible");
                                                    $("#divTrackButtons").css({ "margin-left": "87px" });
                                                    $("#butVideos").attr("href", strYouTubeLink.replace("/watch?v=", "/embed/") + "?fs=1&autoplay=1");
                                                }
                                                else {
                                                    $('#divVideos').css("visibility", "hidden");
                                                    $("#divTrackButtons").css({ "margin-left": "140px" });
                                                }



                                                //Check for featured artists/covered

                                                $('.artistRef').on("click", function () {
                                                    var strArtistName = ($(this).text());

                                                    $.ajax({
                                                        type: "POST",
                                                        async: false,
                                                        url: "/Forms/TertiaryPage.aspx/ArtistLookup",
                                                        data: JSON.stringify({
                                                            'strArtistName': strArtistName
                                                        }),
                                                        contentType: "application/json; charset=utf-8",
                                                        dataType: "json",
                                                        success: function (data) {
                                                            //If folder is found, then redirect
                                                            if (data.d.indexOf("https://") == -1) {
                                                                setTimeout(function () {
                                                                    window.location.replace("/Media/Music/" + data.d);
                                                                }, 300);
                                                            }

                                                            //if not found look into wikipedia/google
                                                            else {
                                                                window.open(data.d, "_blank");
                                                            }
                                                        }
                                                    })
                                                })

                                                $(".aAlbumPageAnchor").click(function () {
                                                    var strNewArtistID = typeof $(this).attr("data-newartist") != 'undefined' ? $(this).attr("data-newartist") : "";
                                                    var strValue = $(this).text();
                                                    $.ajax({
                                                        type: "POST",
                                                        async: false,
                                                        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                                        data: JSON.stringify({
                                                            'strSession1': strNewArtistID,
                                                            'strSession2': "Return",
                                                            'strSession3': "",
                                                            'strSession4': strGlobIsPlaylist,
                                                        }),
                                                        contentType: "application/json; charset=utf-8",
                                                        dataType: "json",
                                                        success: function (data) {
                                                            var sessionVariables = data.d.split(";");
                                                            setTimeout(function () {
                                                                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strValue.replace('.', '·').replace("&", "¿"));
                                                            }, 300);
                                                        }
                                                    });
                                                });
                                                //Click on writer to redirect
                                                $(".spaWriterName").click(function () {
                                                    var strNewArtistID = $(this).text();
                                                    var strValue = $(this).attr("data-href");
                                                    if (strValue.indexOf("https://") == -1) {
                                                        $.ajax({
                                                            type: "POST",
                                                            async: false,
                                                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                                            data: JSON.stringify({
                                                                'strSession1': strNewArtistID,
                                                                'strSession2': "bands",
                                                                'strSession3': "",
                                                                'strSession4': "",
                                                            }),
                                                            contentType: "application/json; charset=utf-8",
                                                            dataType: "json",
                                                            success: function (data) {
                                                                var sessionVariables = data.d.split(";");
                                                                setTimeout(function () {
                                                                    window.location.replace("/Media/Music/" + strValue.replace("&", "¿"));
                                                                }, 300);

                                                            }
                                                        });
                                                    }
                                                    else {
                                                        window.open(strValue, "_blank");
                                                    }
                                                });

                                                //Writer label click
                                                $(".spaWriterLabel").click(function () {
                                                    $("#traWriters").css({ 'display': 'none' });
                                                    $("#txtWriterField").css({ 'display': 'block' });
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        }
                        $(".hp_range").css({ "background": currentColor });
                        var rgbacolor = hexToRgb(currentColor);
                        $(".hp_slide").css({ "background": "rgba(" + rgbacolor + ", 0.3)" });
                    });
                }
            });
        }
    });
});
