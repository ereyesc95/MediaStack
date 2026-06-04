$("body").addClass("dark-mode-main");
var strViewMode = "H";
var intCountItem = 0;
var IndexContent = "";
var player = document.getElementById('player');
var progressBar = document.getElementById('progressAmount');
var strCurrentAudio = "";
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

    $(container).css('background-color', 'rgba(0, 0, 0, 0.9)'); //Background color switch

    //Item type
    switch (data.text.split(';')[0]) {
        case "100": //Countries
            var strGroupLabel = '';
            //First Item
            if (intCountItem == 0) {
                $('#selContinentBck').children().clone().appendTo('#selContinent');
                intCountItem = 1;
            }
            $('#selContinent').children().each(function () {

                if (this.value == data.text.split(';')[1]) {
                    strGroupLabel = '<optgroup label="' + this.label.split(';')[1] + '"></optgroup>';
                    this.remove();
                }
            });

            return $(strGroupLabel + '<span data-continent="' + data.text.split(';')[1] + '" class="customOption" id="' + data.text.split(';')[4] + '"><img src="/Images/Flags/' + data.text.split(';')[2].toLowerCase() + '.svg" class="img-flag" width="15px" style="margin-top:-5px"/>  ' + data.text.split(';')[3] + '</span>');
            break;

        default: //Other items
            var strGroupLabel = '';
            if (intCountItem == 0) {
                $('#selGenreBck').children().clone().appendTo('#selGenre');
                intCountItem = 1;
            }
            $('#selGenre').children().each(function () {

                if (this.value == data.text.split(';')[0]) {
                    strGroupLabel = '<optgroup label="' + this.label.split(';')[1] + '"></optgroup>';
                    this.remove();
                }
            });
            //var itemColor = data.text.split(';')[2]; //Darken color
            //return $('<span class="customOption" style="color:' + itemColor + ';"><i class="fa fa-' + data.text.split(';')[0] + '"></i> ' + data.text.split(';')[1] + '</span>');
            return $(strGroupLabel + '<span class="customOption">' + data.text.split(';')[1] + '</span>');
            break;
    }
}

$('.menuBarButton').on("click", function () {
    $("#divPlayer").css("display", "none");
    document.getElementById('player').pause();
    $("#form1").parent().removeClass("blur-bgimage").css({ 'background-image': 'none' });
    $("#appPageIndex").text("");
    $('#contentSection').empty()
    $("#viewOption").css({
        'display': 'none'
    })

    $(".divSubitem").css({
        'display': 'none'
    })

    $(".divSubFilter").css({
        'display': 'none'
    })
    $('.menuSubItem').removeClass("active");

    var optionTitle = $(this).text().toLowerCase();
    //STORE CONTENTTYPE IN A VARIABLE LIKE 200 300 400
    $('.menuBarButton').removeClass("active");
    $(this).addClass("active");
    var itemSection = $(this).attr("data-value");
    var methodTitle = itemSection == "0" ? "GetDashboardHtmlAsync" : "DisplayFilterContent";
    if (itemSection != "1" && itemSection != "3" && itemSection != "6" && itemSection != "11" && itemSection != "16") {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/" + methodTitle,
            data: JSON.stringify({
                'strFilterId': itemSection,
                'strContentType': optionTitle
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                $("#contentSection").empty().append(data.d);

                //$('.item_container_playlist').on("click", function () {
                //    var strId = $(this).attr("data-id");
                //    var strName = $(this).attr("data-name");
                //    //if it's [Music] orVideo Series
                //    $.ajax({
                //        type: "POST",
                //        async: false,
                //        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                //        data: JSON.stringify({
                //            'strSession1': "userplaylist" + strId,
                //            'strSession2': "userplaylist",
                //            'strSession3': "01.01.1000. " + strName,
                //            'strSession4': "",
                //        }),
                //        contentType: "application/json; charset=utf-8",
                //        dataType: "json",
                //        success: function (data) {
                //            //redirect to page 3
                //            var sessionVariables = data.d.split(";");
                //            setTimeout(function () {
                //                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0] + "/" + strName);

                //            }, 500);
                //        }
                //    });
                //});
            }
        });
    }
    $(".divSubitem"+itemSection).css({
        'display': 'block'
    })

    $(".sectionColumn").click(function () {

        var strCurrentName = $(this).attr("data-name");
        var strCurrentCode = $(this).attr("data-code");
        var strCurrentID = $(this).attr("data-id");
        var strUnregisteredFlag = 0;

        if ($(this).hasClass("item_container_unreg")) {
            strUnregisteredFlag = 1;
        }

        if ($(this).hasClass("sectionTrackRow")) {
            //Song click
            $("#divPlayer").css("display", "block");
            $(".sectionColumn").removeClass("activePlayingTrack");
            $(".imgTopTrack").removeClass("activeTrack");
            $(".imgTopTrack").css({ "border": "0px solid transparent" });
            $(this).addClass("activePlayingTrack");
            $(this).children(".imgTopTrack").addClass("activeTrack");
            var strValue = $(this).attr("data-value");
            strPlaying = 1;
            $("#player").attr("src", strValue);
            $(".aPause").css({ 'display': 'block' });
            $(".aPlay").css({ 'display': 'none' });
            document.getElementById('player').play();
            //add color frame to picture
            $(".activeTrack").css({ "border": "1px solid aliceblue" });
            $(".hp_range").css({ "background-color": "aliceblue" });

            document.getElementById('player').addEventListener("timeupdate", function () {
                var currentTime = player.currentTime;
                var duration = player.duration;
                $('.hp_range').stop(true, true).animate({ 'width': (currentTime + .25) / duration * 100 + '%' }, 250, 'linear');
            });

            document.getElementById('player').addEventListener('ended', ended);
            document.getElementById('progressAmountBack').addEventListener("click", seek);

        }
        else if ($(this).hasClass("externalItem")) {
            var strWebPath = $(this).attr("data-value");
            window.open(strWebPath, "_blank");
        }
        else {
            //Artist click
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                data: JSON.stringify({
                    'strSession1': strCurrentName,
                    'strSession2': strCurrentCode,
                    'strSession3': strCurrentID,
                    'strSession4': "",
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    var sessionVariables = data.d.split(";");
                    setTimeout(function () {

                        if (strUnregisteredFlag == 1) {
                            $("#modalRegDataDiv").click();
                            document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                            $(document).click(function () {
                                location.reload();
                            });

                        }
                        else {
                            window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                        }

                    }, 500);

                }
            });
        }
    });
});

//Player
var strPlaying = 0;

function seek(e) {
    var percent = e.offsetX / this.offsetWidth;
    document.getElementById('player').currentTime = percent * document.getElementById('player').duration;
    document.getElementById('progressAmount').value = percent / 100;
}

function ended(e) {
    var nextItem = $('.activePlayingTrack').next('.sectionTrackRow');
    if (nextItem.length == 1) {
        nextItem.trigger('click');
    } else {
        $('.activePlayingTrack').siblings('.sectionTrackRow').first().trigger('click');
    }
}

$(".aPlay").click(function () {
    strPlaying = 1;
    $(".aPause").css({ 'display': 'block' });
    $(".aPlay").css({ 'display': 'none' });
    document.getElementById('player').play();

});

$(".aPause").click(function () {
    if (strPlaying == 1) {
        strPlaying = 0;
        $(".aPause").css({ 'display': 'none' });
        $(".aPlay").css({ 'display': 'block' });
        document.getElementById('player').pause();
    }
});

$('.aPrev').on('click', function () {
    var prevItem = $('.activePlayingTrack').prev('.sectionTrackRow');
    if (prevItem.length == 1) {
        prevItem.trigger('click');
    } else {
        $('.activePlayingTrack').siblings('.sectionTrackRow').last().trigger('click');
    }
});

$('.aNext').on('click', function () {
    var nextItem = $('.activePlayingTrack').next('.sectionTrackRow');
    if (nextItem.length == 1) {
        nextItem.trigger('click');
    } else {
        $('.activePlayingTrack').siblings('.sectionTrackRow').first().trigger('click');
    }
});

$('.menuSubItem').on("click", function () {
    $('#contentSection').empty();
    $("#appPageIndex").text("");

    var itemSection = $(this).attr("data-parent");
    $(".divSubFilter").css({
        'display': 'none'
    });

    var itemTable = $(this).attr("data-table");

    $('.menuSubItem').removeClass("active");
    $(this).addClass("active");

    $("#form1").parent().removeClass("blur-bgimage").css({'background-image': 'none'});

    intCountItem = 0;
    if (itemTable == "reproductions") {
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/DisplayContent",
            data: JSON.stringify({
                'strOption': $(this).text(),
                'strID': $(this).attr("data-id"),
                'strTable': itemTable,
                'strDataType': "none",
                'strViewMode': strViewMode,
                'strCurColor': ""
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                data.d = data.d.replace(/\■/g, ',').replace(/\█/g, '\'');
                $('#contentSection').empty().append(data.d);

                $("#viewOption").css({
                    'display': 'block'
                })

                //Switch view
                $("#viewOption").click(function () {
                    if (data.d.indexOf("_V") >= 0) {
                        data.d = data.d.replace(/\_V/g, '_H');
                        strViewMode = "H";
                    }
                    else {
                        data.d = data.d.replace(/\_H/g, '_V');
                        strViewMode = "V";
                    }

                    $('#contentSection').empty().append(data.d);
                    $(".itemBox").click(function () {

                        var strCurrentName = $(this).attr("data-name");
                        var strCurrentCode = $(this).attr("data-code");
                        var strCurrentID = $(this).attr("data-id");

                        var strUnregisteredFlag = 0;

                        if ($(this).hasClass("item_container_unreg")) {
                            strUnregisteredFlag = 1;
                        }

                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                            data: JSON.stringify({
                                'strSession1': strCurrentName,
                                'strSession2': strCurrentCode,
                                'strSession3': strCurrentID,
                                'strSession4': "",
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                var sessionVariables = data.d.split(";");
                                setTimeout(function () {

                                    if (strUnregisteredFlag == 1) {
                                        $("#modalRegDataDiv").click();
                                        document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                        $(document).click(function () {
                                            location.reload();
                                        });

                                    }
                                    else {
                                        window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                    }

                                }, 500);

                            }
                        });
                    });

                });
                //Set Session variables to show on modal for registration

                $(".itemBox").click(function () {

                    var strCurrentName = $(this).attr("data-name");
                    var strCurrentCode = $(this).attr("data-code");
                    var strCurrentID = $(this).attr("data-id");
                    var strUnregisteredFlag = 0;

                    if ($(this).hasClass("item_container_unreg")) {
                        strUnregisteredFlag = 1;
                    }

                    $.ajax({
                        type: "POST",
                        async: false,
                        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                        data: JSON.stringify({
                            'strSession1': strCurrentName,
                            'strSession2': strCurrentCode,
                            'strSession3': strCurrentID,
                            'strSession4': "",
                        }),
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        success: function (data) {
                            var sessionVariables = data.d.split(";");
                            setTimeout(function () {

                                if (strUnregisteredFlag == 1) {
                                    $("#modalRegDataDiv").click();
                                    document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                    $(document).click(function () {
                                        location.reload();
                                    });

                                }
                                else {
                                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                }

                            }, 500);

                        }
                    });
                });
            }
        });
    }
    else {
        //Get subfilter options
        $.ajax({
            type: "POST",
            async: false,
            url: "/Forms/PrimaryPage.aspx/FillSubFilters",
            data: JSON.stringify({
                'strTable': $(this).attr("data-table"),
                'strFields': $(this).attr("data-field"),
                'strParent': $(this).attr("data-parent"),
                'strDataType': $(this).attr("data-type")
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {
                if (data.d.includes("VARIOUS_ARTISTS")) {
                    data.d = data.d.replace(/VARIOUS_ARTISTS/g, "");
                }
                $('.subfilternav').empty().append(data.d);
                $(".divSubFilter" + itemSection).css({
                    'display': 'block'
                });
                $('.select2').select2({
                    multiple: false,
                    minimumResultsForSearch: 1,
                    templateSelection: iformat,
                    templateResult: iformat,
                    selectOnClose: false,
                    width: '100%'
                });
                $(".select2").click(function () {
                    intCountItem = 0;
                });
                $(".select2").change(function () {
                    intCountItem = 0;
                    var selItem = $(this).find(":selected").text();

                    switch (selItem.split(';')[0].substring(0, 3)) {
                        case "100": //Countries
                            $("#appPageIndex").empty().append('<img src="/Images/Flags/' + selItem.split(';')[2].toLowerCase() + '.svg" class="img-flag" width="40px" style="margin-top:-5px;object-fit: cover;height: 40px;border-radius: 50%"/>  ' + selItem.split(';')[3]);
                            $("#form1").parent().addClass("blur-bgimage");
                            $("#form1").parent().css({
                                'background-image': 'url("/Images/Flags/' + selItem.split(';')[2].toLowerCase() + '.svg")',
                                'background-position': 'center',
                                'background-repeat': 'no-repeat',
                                'background-size': 'cover'
                            });
                            break;

                        case "200": //Genres
                            $("#appPageIndex").empty().append('<img src="/Images/Genres/' + selItem.split(';')[0] + '.png" width="40px" style="margin-top:-5px;border-radius: 50%"/>  ' + selItem.split(';')[1]);
                            $("#form1").parent().addClass("blur-bgimage");
                            $("#form1").parent().css({
                                'background-image': 'url("/Images/Genres/' + selItem.split(';')[0] + '.png")',
                                'background-position': 'center',
                                'background-repeat': 'no-repeat',
                                'background-size': 'cover'
                            });
                            break;
                        case "Lab": //Label
                            $("#appPageIndex").empty().append('<img src="/Images/Companies/' + selItem.split(';')[1].toLowerCase() + '.png" height="40px" style="margin-top:-5px;"/>');
                            break;
                        case "Pro": //Producer
                            let name = selItem.split(';')[1].toLowerCase();
                            let firstChar = name.charAt(0); // Get the first character (N)
                            let initial;

                            if (/[a-zA-Z]/.test(firstChar)) {
                                // It's a letter
                                initial = firstChar;
                            } else if (/[0-9]/.test(firstChar)) {
                                // It's a number
                                initial = "#";
                            } else {
                                // It's a special character or symbol
                                initial = "";
                            }
                            $("#appPageIndex").empty().append('<img src="/Images/Artists/' + initial + "/" + name + ' (producer).png" height="40px" width="40px" style="margin-top:-5px; object-fit:cover;border-radius: 50%"/>  ' + selItem.split(';')[1]);
                            break;
                        default: //Other 
                            $("#appPageIndex").text("");
                            break;
                    }


                    $.ajax({
                        type: "POST",
                        async: false,
                        url: "/Forms/PrimaryPage.aspx/DisplayContent",
                        data: JSON.stringify({
                            'strOption': $(this).find(":selected").val(),
                            'strID': $(this).find(":selected").attr("id"),
                            'strTable': itemTable,
                            'strDataType': "select",
                            'strViewMode': strViewMode,
                            'strCurColor': ""
                        }),
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        success: function (data) {
                            data.d = data.d.replace(/\■/g, ',').replace(/\█/g, '\'');
                            $('#contentSection').empty().append(data.d);

                            $("#viewOption").css({
                                'display': 'block'
                            })

                            //Switch view
                            $("#viewOption").click(function () {
                                if (data.d.indexOf("_V") >= 0) {
                                    data.d = data.d.replace(/\_V/g, '_H');
                                    strViewMode = "H";
                                }
                                else {
                                    data.d = data.d.replace(/\_H/g, '_V');
                                    strViewMode = "V";
                                }

                                $('#contentSection').empty().append(data.d);
                                $(".itemBox").click(function () {

                                    var strCurrentName = $(this).attr("data-name");
                                    var strCurrentCode = $(this).attr("data-code");
                                    var strCurrentID = $(this).attr("data-id");
                                    var strUnregisteredFlag = 0;

                                    if ($(this).hasClass("item_container_unreg")) {
                                        strUnregisteredFlag = 1;
                                    }

                                    $.ajax({
                                        type: "POST",
                                        async: false,
                                        url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                        data: JSON.stringify({
                                            'strSession1': strCurrentName,
                                            'strSession2': strCurrentCode,
                                            'strSession3': strCurrentID,
                                            'strSession4': "",
                                        }),
                                        contentType: "application/json; charset=utf-8",
                                        dataType: "json",
                                        success: function (data) {
                                            var sessionVariables = data.d.split(";");
                                            setTimeout(function () {

                                                if (strUnregisteredFlag == 1) {
                                                    $("#modalRegDataDiv").click();
                                                    document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                                    $(document).click(function () {
                                                        location.reload();
                                                    });

                                                }
                                                else {
                                                    window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                                }

                                            }, 500);

                                        }
                                    });
                                });

                            });
                            //Set Session variables to show on modal for registration

                            $(".itemBox").click(function () {

                                var strCurrentName = $(this).attr("data-name");
                                var strCurrentCode = $(this).attr("data-code");
                                var strCurrentID = $(this).attr("data-id");
                                var strUnregisteredFlag = 0;

                                if ($(this).hasClass("item_container_unreg")) {
                                    strUnregisteredFlag = 1;
                                }

                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                    data: JSON.stringify({
                                        'strSession1': strCurrentName,
                                        'strSession2': strCurrentCode,
                                        'strSession3': strCurrentID,
                                        'strSession4': "",
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {
                                        var sessionVariables = data.d.split(";");
                                        setTimeout(function () {

                                            if (strUnregisteredFlag == 1) {
                                                $("#modalRegDataDiv").click();
                                                document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                                $(document).click(function () {
                                                    location.reload();
                                                });

                                            }
                                            else {
                                                window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                            }

                                        }, 500);

                                    }
                                });
                            });
                        }
                    });
                });
            }
        });

        var charCount = 1;
        //If search input value is > 2
        $(".FilterSearch").keyup(function (event) {
            var key = event.keyCode || event.which;
            if (key === 13) {
                event.preventDefault();
            }
            else {
                if (itemTable == "artists") {
                    charCount = 4
                }
                if ($(this).val().length > charCount) {
                    $('#lstSearchFilter').empty();
                    $.ajax({
                        type: "POST",
                        async: false,
                        url: "/Forms/PrimaryPage.aspx/GetSearchFilter",
                        data: JSON.stringify({
                            'strName': $(this).val(),
                            'strTable': itemTable,
                            'strContentID': '',
                            'strParent': ''
                        }),
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",
                        success: function (data) {
                            $('#lstSearchFilter').empty().append(data.d);


                        }
                    });
                }
                else {
                    $('#lstSearchFilter').empty();
                }
            }
        });


        $("#SubFilterOptSearch").on('input', function () {
            var val = this.value;
            if ($('#lstSearchFilter option').filter(function () {
                return this.value.toUpperCase() === val.toUpperCase();
            }).length) {

                $.ajax({
                    type: "POST",
                    async: false,
                    url: "/Forms/PrimaryPage.aspx/DisplayContent",
                    data: JSON.stringify({
                        'strOption': val,
                        'strID': $('#lstSearchFilter [value="' + val + '"]').data('value'),
                        'strTable': itemTable,
                        'strDataType': "search",
                        'strViewMode': strViewMode,
                        'strCurColor': ""
                    }),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                    success: function (data) {
                        data.d = data.d.replace(/\■/g, ',').replace(/\█/g, '\'');
                        $('#contentSection').empty().append(data.d);

                        $("#viewOption").css({
                            'display': 'block'
                        })

                        //Switch view
                        $("#viewOption").click(function () {
                            if (data.d.indexOf("_V") >= 0) {
                                data.d = data.d.replace(/\_V/g, '_H');
                                strViewMode = "H";
                            }
                            else {
                                data.d = data.d.replace(/\_H/g, '_V');
                                strViewMode = "V";
                            }

                            $('#contentSection').empty().append(data.d);
                            $(".itemBox").click(function () {

                                var strCurrentName = $(this).attr("data-name");
                                var strCurrentCode = $(this).attr("data-code");
                                var strCurrentID = $(this).attr("data-id");

                                $.ajax({
                                    type: "POST",
                                    async: false,
                                    url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                    data: JSON.stringify({
                                        'strSession1': strCurrentName,
                                        'strSession2': strCurrentCode,
                                        'strSession3': strCurrentID,
                                        'strSession4': "",
                                    }),
                                    contentType: "application/json; charset=utf-8",
                                    dataType: "json",
                                    success: function (data) {
                                        $("#modalRegDataDiv").click();
                                        document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                    }
                                });
                            });

                        });
                        //Set Session variables to show on modal for registration

                        $(".itemBox").click(function () {

                            var strCurrentName = $(this).attr("data-name");
                            var strCurrentCode = $(this).attr("data-code");
                            var strCurrentID = $(this).attr("data-id");
                            var strUnregisteredFlag = 0;

                            if ($(this).hasClass("item_container_unreg")) {
                                strUnregisteredFlag = 1;
                            }

                            $.ajax({
                                type: "POST",
                                async: false,
                                url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                data: JSON.stringify({
                                    'strSession1': strCurrentName,
                                    'strSession2': strCurrentCode,
                                    'strSession3': strCurrentID,
                                    'strSession4': "",
                                }),
                                contentType: "application/json; charset=utf-8",
                                dataType: "json",
                                success: function (data) {
                                    var sessionVariables = data.d.split(";");
                                    setTimeout(function () {

                                        if (strUnregisteredFlag == 1) {
                                            $("#modalRegDataDiv").click();
                                            document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                            $(document).click(function () {
                                                location.reload();
                                            });

                                        }
                                        else {
                                            window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                        }

                                    }, 500);

                                }
                            });
                        });
                    }
                });
            }
        });


        $(".SubFilterMain").click(function () {
            $(".SubFilterMain").removeClass("active");
            $("#form1").parent().removeClass("blur-bgimage").css({ 'background-image': 'none' });
            $("#appPageIndex").empty();
            $(this).addClass("active");
            $('#contentSection').empty();
            //Display view option in navbar
            $("#viewOption").css({
                'display': 'block'
            });

            switch (itemTable) {

                case "continents":
                    $("#appPageIndex").empty().append('<img src="/Images/' + itemTable + '/' + $(this).attr("data-id") + '.png" class="img-flag" width="40px" style="margin-top:-5px;object-fit: cover;height: 40px;border-radius: 50%"/>  ' + $(this).text());
                    $("#form1").parent().addClass("blur-bgimage");
                    $("#form1").parent().css({
                        'background-image': 'url("/Images/' + itemTable + '/' + $(this).attr('data-id') + '.png")',
                        'background-position': 'center',
                        'background-repeat': 'no-repeat',
                        'background-size': 'cover'
                    });
                    break;
                case "startdate":
                case "enddate":
                    if ($(this).text() != "All") {
                        $("#appPageIndex").empty().append('<img src="/Images/Decades/' + $(this).text() + '.png" class="img-flag" width="40px" style="margin-top:-5px;border-radius: 50%"/>  ' + $(this).text());
                        $("#form1").parent().addClass("blur-bgimage");
                        $("#form1").parent().css({
                            'background-image': 'url("/Images/Decades/' + $(this).text() + '.png")',
                            'background-position': 'center',
                            'background-repeat': 'no-repeat',
                            'background-size': 'cover'
                        });
                    }
                    break;
                case "genders":
                    //$("#appPageIndex").empty().append('<span class="customOption" style="color:#C6C2C6"><i class="fa fa-' + $(this).text.split(';')[1] + '"></i> ' + $(this).text.split(';')[2] + '</span>');
                    break;

                default: //Other 
                    $("#appPageIndex").text("");
                    break;
            }

            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/DisplayContent",
                data: JSON.stringify({
                    'strOption': $(this).text(),
                    'strID': $(this).attr("data-id"),
                    'strTable': itemTable,
                    'strDataType': "list",
                    'strViewMode': strViewMode,
                    'strCurColor': ""
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    data.d = data.d.replace(/\■/g, ',').replace(/\█/g, '\'');
                    $('#contentSection').empty().append(data.d);

                    $("#viewOption").css({
                        'display': 'block'
                    })

                    //Switch view
                    $("#viewOption").click(function () {
                        if (data.d.indexOf("_V") >= 0) {
                            data.d = data.d.replace(/\_V/g, '_H');
                            strViewMode = "H";
                        }
                        else {
                            data.d = data.d.replace(/\_H/g, '_V');
                            strViewMode = "V";
                        }

                        $('#contentSection').empty().append(data.d);
                        $(".itemBox").click(function () {

                            var strCurrentName = $(this).attr("data-name");
                            var strCurrentCode = $(this).attr("data-code");
                            var strCurrentID = $(this).attr("data-id");

                            var strUnregisteredFlag = 0;

                            if ($(this).hasClass("item_container_unreg")) {
                                strUnregisteredFlag = 1;
                            }

                            $.ajax({
                                type: "POST",
                                async: false,
                                url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                                data: JSON.stringify({
                                    'strSession1': strCurrentName,
                                    'strSession2': strCurrentCode,
                                    'strSession3': strCurrentID,
                                    'strSession4': "",
                                }),
                                contentType: "application/json; charset=utf-8",
                                dataType: "json",
                                success: function (data) {
                                    var sessionVariables = data.d.split(";");
                                    setTimeout(function () {

                                        if (strUnregisteredFlag == 1) {
                                            $("#modalRegDataDiv").click();
                                            document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                            $(document).click(function () {
                                                location.reload();
                                            });

                                        }
                                        else {
                                            window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                        }

                                    }, 500);

                                }
                            });
                        });

                    });
                    //Set Session variables to show on modal for registration

                    $(".itemBox").click(function () {

                        var strCurrentName = $(this).attr("data-name");
                        var strCurrentCode = $(this).attr("data-code");
                        var strCurrentID = $(this).attr("data-id");
                        var strUnregisteredFlag = 0;

                        if ($(this).hasClass("item_container_unreg")) {
                            strUnregisteredFlag = 1;
                        }

                        $.ajax({
                            type: "POST",
                            async: false,
                            url: "/Forms/PrimaryPage.aspx/SetSessionVariables",
                            data: JSON.stringify({
                                'strSession1': strCurrentName,
                                'strSession2': strCurrentCode,
                                'strSession3': strCurrentID,
                                'strSession4': "",
                            }),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",
                            success: function (data) {
                                var sessionVariables = data.d.split(";");
                                setTimeout(function () {

                                    if (strUnregisteredFlag == 1) {
                                        $("#modalRegDataDiv").click();
                                        document.getElementById("unregisteredRegModal").contentDocument.location.reload(true);

                                        $(document).click(function () {
                                            location.reload();
                                        });

                                    }
                                    else {
                                        window.location.replace("/Media/" + sessionVariables[2] + "/" + sessionVariables[0]);
                                    }

                                }, 500);

                            }
                        });
                    });
                }
            });
        });
    }
});

$(document).ready(function () {
    $("#menuItem0").click();
});


//Set Navegation Bar
$.get("/Forms/SectionBar.html", function (data) {
    //$("#barNavSection").replaceWith(data);
    //$.ajax({
    //    type: "POST",
    //    async: false,
    //    url: "/Forms/PrimaryPage.aspx/LoadSectionBar",
    //    data: "",
    //    contentType: "application/json; charset=utf-8",
    //    dataType: "json",
    //    success: function (userData) {
    //        var userPath = userData.d.split(';')[0];
    //        var userName = userData.d.split(';')[1];
    //        var userRole = userData.d.split(';')[2];
    //        $("#menuButton").css({
    //            'background-image': 'url(' + userPath + ')'
    //        })
    //        $("#userOption").text(userName);

    //        if (userRole == '2') {
    //            $("#writeOption").css({
    //                'display': 'block'
    //            })
    //        }
    //    }
    //});
});