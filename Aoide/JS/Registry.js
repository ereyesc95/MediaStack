var intContinent = $("#selContinent").children().length;
$(document).ready(function () {

    //Change color hues
    function LightenDarkenColor(col, amt) {

        var usePound = false;

        if (col[0] == "#") {
            col = col.slice(1);
            usePound = true;
        }

        var num = parseInt(col, 16);
        var r = (num >> 16) + amt;

        if (r > 255) r = 255;
        else if (r < 0) r = 0;

        var b = ((num >> 8) & 0x00FF) + amt;

        if (b > 255) b = 255;
        else if (b < 0) b = 0;

        var g = (num & 0x0000FF) + amt;

        if (g > 255) g = 255;
        else if (g < 0) g = 0;

        return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);

    }

    //Style select2 options
    function iformat(data, container) {
        //Disabled options
        if (data.text.indexOf('DisOption') > -1) {
            $(container).css({
                'margin-top': '1px',
                'background-color': '#121212',
                'border-bottom': '0.5px solid #C6C2C6'
            });
            return $('<span class="customOption" style="color:#C6C2C6"><i class="fa fa-' + data.text.split(';')[1] + '"></i> ' + data.text.split(';')[2] + '</span>');
        }

        $(container).css('background-color', '#272727'); //Background color switch

        //Item type
        switch (data.text.split(';')[0]) {
            case "100": //Countries
                var strGroupLabel = '';
                //First Item
                if ($("#selContinent").children().length == 0 && data.id == "100001") {
                    $('#selContinentBck').children().clone().appendTo('#selContinent');
                }
                $('#selContinent').children().each(function () {

                    if (this.value == data.text.split(';')[1]) {
                        strGroupLabel = '<optgroup label="' + this.label.split(';')[1] + '"></optgroup>';
                        this.remove();
                    }
                });

                return $(strGroupLabel + '<span data-continent="' + data.text.split(';')[1] + '" class="customOption" id="' + data.text.split(';')[4] + '"><img src="/Images/Flags/' + data.text.split(';')[2].toLowerCase() + '.svg" class="img-flag" width="15px"/>  ' + data.text.split(';')[3] + '</span>');
                break;

            default: //Other items
                var itemColor = data.text.split(';')[2]; //Darken color
                return $('<span class="customOption" style="color:' + itemColor + ';"><i class="fa fa-' + data.text.split(';')[0] + '"></i> ' + data.text.split(';')[1] + '</span>');
                break;
        }
    }

    // Select2 style function call
    $('.selectCustom').select2({
        multiple: false,
        minimumResultsForSearch: 1,
        templateSelection: iformat,
        templateResult: iformat,
        selectOnClose: false,
        width: '90%'
    });

    //Initialize datepicker
    $("#usrBirthDate").datepicker();
    $("#usrBirthDate").css('font-family', 'Lexend');


});

setTimeout(function () {
    var intCountOptions = 0;
    //Fill gender options
    $("#usrGender > option").each(function () {
        if (intCountOptions > 0) {
            $(this).html($(this).text().split(';')[0] + ";" + $(this).text().split(';')[1] + ";" + $(this).text().split(';')[2]);
            $(this).addClass("selectIcons");
        }
        intCountOptions++;
    });

    //Initialize sliders
    var elms = document.getElementsByClassName('splide');
    for (var i = 0, len = elms.length; i < len; i++) {

        new Splide('.splide', {
            perPage: 1,
            perMove: 1,
            focus: 'center',
            trimSpace: false,
            fixedWidth: '20rem',
            fixedHeight: '30rem',
            arrows: false

        }).mount();
    }

}, 2);

//Toggle dark mode
$("#modbody").addClass("dark-mode-main");
$(".inputField").addClass("dark-mode-secondary");
$(".inputFieldSecondary").addClass("dark-mode-secondary-page");
$(".inputFieldTertiary").addClass("dark-mode-secondary-page");
$(".labelField").toggleClass("dark-mode-tertiary");
$("option").addClass("dark-mode-tertiary");
$(".systemImage").addClass("invertColor");
$(".customOption").parent().css({
    'border-bottom': '0.5px solid #C6C2C6',
    'background-color': 'transparent'
});
$(".customOption").css({
    'color': '#C6C2C6'
});

//Select option in select2
$(document.body).on("change", ".selectCustom", function () {
    $(".customOption").parent().css({
        'background-color': 'transparent'
    });

    $(".customOption").css({
        'color': '#C6C2C6'
    });
});

$(".inputFieldSecondary").keyup(function () {
    $(this).attr({ size: $(this).val().length + 2 });
});

$(".inputFieldTertiary").keyup(function () {
    $(this).attr({ size: $(this).val().length + 2 });
});

//Preview picture
function readURL(input, id) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();

        reader.onload = function (e) {
            $("#" + id).attr('src', e.target.result);
            $("#" + id).css('background-image', 'url(' + e.target.result + ')');
        }
        reader.readAsDataURL(input.files[0]); // convert to base64 string
    }
}

$(".picturePreview").hover(function () {
    $(this).siblings(".addPicture").css("display", "block");
    $(this).css({
        "opacity": "0.5",
        "cursor": "pointer",
    });
}, function () {
    $(this).siblings(".addPicture").css("display", "none");
    $(this).css({
        "opacity": "1",
        "cursor": "pointer",
    });
});

$(".addPicture").hover(function () {
    $(this).css("display", "block");
    $(this).siblings(".picturePreview").css({
        "opacity": "0.5",
        "cursor": "pointer",
    });
}, function () {
    $(this).siblings(".picturePreview").css({
        "opacity": "1",
        "cursor": "pointer",
    });
});

$(".picturePreview").click(function () {
    $(this).siblings(".inputField").click();
});
$(".addPicture").click(function () {
    $(this).siblings(".inputField").click();
});

$(".inputImage").change(function () {
    readURL(this, $(this).siblings(".picturePreview").attr('id'));
    $(".systemImage").removeClass("invertColor");
});


//On open modal
$('.modal').on('shown.bs.modal', function (e) {
});


//Password check
$(".passField").on("keyup change", function (e) {
    if ($(this).val() != '' && $(this).siblings(".passField").val() != '' && $(this).val() != $(this).siblings(".passField").val()) {

        $("#spanPassword").css('display', 'block');
    }
    else {
        $("#spanPassword").css('display', 'none');
    }
});

//$(document.body).css({ "background-image": "url(/Images/System/Background.png)" });
$(document.body).css({ "background-color": "#202020" });
$(document.body).css({ "box-shadow": "inset 0 0 100px black " });
//202020
//Artist data modal

$("#artEdit").on("click", function () {
    $(this).css("display", "none");
    $("#artLineOrigin").css("display", "none");
    $("#artLineAlias").css("display", "block");
    $("#artLineBirthName").css("display", "block");
    $("#artLinePlaces").css("display", "block");
    $("#artLineAge").css("display", "none");
    $("#artLineDates").css("display", "block");
    $("#artSave").css("display", "block");
    $("#artLineParticipations").css("display", "block");
    $("#artLineProjects").css("display", "none");
    $(".artDataField").attr('disabled', false);
    $("#artAlias").val($("#artAlias").val().replace(" • ", "/"));
});

$("#artSave").on("click", function () {
    $("#artEdit").css("display", "block");
    $("#artLineOrigin").css("display", "block");
    $("#artLinePlaces").css("display", "none");
    $("#artLineDates").css("display", "none");
    $("#artLineAge").css("display", "block");
    $("#artLineParticipations").css("display", "none");
    $("#artLineProjects").css("display", "block");
    $(this).css("display", "none");
    $(".artDataField").attr('disabled', true);


    var strData = "0>artID@" + $("#artID").val() + "^" +
        "3>artStageName@" + $("#artName").val() + "^" +
        "2>artName@" + $("#artBirthName").val() + "^" +
        "4>artAliases@" + $("#artAlias").val() + "^" +
        "7>artBirthFKcountries@" + $("#artCountry").val() + "^" +
        "6>artBirthPlace@" + $("#artCity").val() + "^" +
        "5>artBirthDate@" + $("#dtBirthDate").val() + "^" +
        "8>artDeathDate@" + $("#dtDeathDate").val();

    var strParticipationsOld = "";

    for (var i = 0; i < document.querySelectorAll('.artPartRowOld').length; i++) {
        strParticipationsOld = strParticipationsOld +
            "a" + i +">arpFKbands@" + $("#artPartRowOld" + i).attr("data-id") + "^" +
            "b" + i +">arpFKbands@" + $("#artPartProjectOld" + i).val() + "^" +
            "c" + i +">arpStartDates@" + $("#artPartStartOld" + i).val() + "^" +
            "d" + i +">arpEndDates@" + $("#artPartEndOld" + i).val() + "^" +
            "e" + i +">arpFKparticipationtypes@" + $("#artPartTypeOld" + i).val() + "^" +
            "f" + i +">artFKinstruments@" + $("#artPartRoleOld" + i).val() + "^" +
            "g" + i +">arpCheck@" + $("#artPartCheckOld" + i).val() + "*";
    }

    strParticipationsOld = strParticipationsOld.slice(0, -1);


    var strParticipationsNew = "";

    for (var i = 0; i < document.querySelectorAll('.artPartRowNew').length; i++) {
        strParticipationsNew = strParticipationsNew +
            "b" + i +">arpFKbands@" + document.getElementById("artPartProjectNew" + i).value + "^" +
            "c" + i +">arpStartDates@" + document.getElementById("artPartStartNew" + i).value + "^" +
            "d" + i +">arpEndDates@" + document.getElementById("artPartEndNew" + i).value + "^" +
            "e" + i +">arpFKparticipationtypes@" + document.getElementById("artPartTypeNew" + i).value + "^" +
            "f" + i +">artFKinstruments@" + document.getElementById("artPartRoleNew" + i).value + "^" +
            "g" + i +">arpCheck@" + $("#artPartCheckNew" + i).val() + "*";
    }

    strParticipationsNew = strParticipationsNew.slice(0, -1);

    //Artist Participation CRUD
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/ArtistData.aspx/SaveArtistChanges",
        data: JSON.stringify({
            'strData': strData,
            'strParticipationsOld': strParticipationsOld,
            'strParticipationsNew': strParticipationsNew
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            window.top.location.reload();
        }
    });
});

var intCount = 0;

$("#artPartAdd").on('click', function () {
    var row = "<tr id='artPartRowNew" + intCount + "' class='artPartRow artPartRowNew' data-id='new' data-code='new' style='margin-left-5px'>" +
        "<td class='artTD artTDProject' style='line-height: 1px'><input type='text' <a id='artPartProjectNew" + intCount + "' class='dark-mode-secondary-page inputFieldTertiary artDataField artParticipation artPartProject artPartProjectNew' style='width:120px;font-weight:bold' placeholder='Project'/></td>" +
        "<td class='artTD artTDStart 'style='line-height: 1px'><input type='text' <a id='artPartStartNew" + intCount + "' class='dark-mode-secondary-page inputFieldTertiary artDataField artParticipation artPartStart artPartStartNew' style='width:50px' placeholder='Start date'/></td>" +
        "<td class='artTD artTDEnd' style='line-height: 1px'><input type='text' <a id='artPartEndNew" + intCount + "' class='dark-mode-secondary-page inputFieldTertiary artDataField artParticipation artPartEnd artPartEndNew' style='width:50px' placeholder='End date'/></td>" +
        "<td class='artTD artTDType' style='line-height: 1px'><input type='text' <a id='artPartTypeNew" + intCount + "' class='dark-mode-secondary-page inputFieldTertiary artDataField artParticipation artPartType artPartTypeNew' style='width:80px' placeholder='Type' /></td>" +
        "<td class='artTD artTDRole' style='line-height: 1px'><input type='text' <a id='artPartRoleNew" + intCount + "' class='dark-mode-secondary-page inputFieldTertiary artDataField artParticipation artPartRole artPartRoleNew' style='width:90px' placeholder='Role' /></td><" +
        "<td class='artTD artTDDel' style='line-height: 1px;opacity:0.4'><a id='artPartDelNew" + intCount + "' class='artPartDel' title='Remove' style='color: aliceblue;font-size:8px' href='javascript:void(0)' onclick='DeleteNewRow(" + intCount + ")'><i class='fa fa-minus' aria-hidden='true'></i></a></td>" +
        "<td class='artTD artTDCheck' style='line-height: 1px;'><input type='text' id='artPartCheckNew" + intCount + "' class='dark-mode-secondary-page inputFieldTertiary artDataField artParticipation artPartCheck' style='display:none' value='N' /></td></tr>"
    $('#artPartTable tbody:last').append(row);
    intCount++;
});

$(".artParticipation").keyup(function () {
    $(this).parent(".artTD").siblings(".artTDCheck").children(".artPartCheck").val("U");
});

$(".artPartDel").on('click', function () {
    $(this).parent(".artTD").siblings(".artTDCheck").children(".artPartCheck").val("D");
    $(this).parent(".artTD").parent(".artPartRow").css("display", "none");
});

function DeleteNewRow(e) {
    document.getElementById("artPartCheckNew" + e).value = "D";
    document.getElementById("artPartRowNew" + e).hidden = true;

}
$(".relProject").click(function () {
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
        data: JSON.stringify({
            'strSession1': $(this).text(),
            'strSession2': $(this).attr("data-code"),
            'strSession3': $(this).attr("data-id") + "_Link_Click"
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            var sessionVariables = data.d.split(";");
            setTimeout(function () {
                //window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                window.top.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
            }, 300);

        }
    });

});
