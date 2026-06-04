<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="PrimaryPage.aspx.cs" Inherits="Aoide.Forms.PrimaryPage" %>

<!DOCTYPE html>

<html xmlns="http://www.w3.org/1999/xhtml">
<head runat="server">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous" />
    <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css" rel="stylesheet" />
    <link href='https://fonts.googleapis.com/css?family=Lexend' rel='stylesheet' />
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.materialdesignicons.com/5.4.55/css/materialdesignicons.min.css" />
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkStyles" href="~/Styles/Main.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkNavBar" href="~/Styles/NavBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSectionBar" href="~/Styles/SectionBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>MediaBinger - Write Data</title>
</head>
<body>

    <form id="form1" runat="server">
        <div id="nav-placeholder"></div>
        <br />
        <div id="divSelect">
            <select id="selContinent" name="selContinent" runat="server" class="inputField input-lg" style="display: none"></select>
            <select id="selContinentBck" name="selContinentBck" runat="server" class="inputField input-lg" style="display: none"></select>
            <select id="selGenre" name="selGenre" runat="server" class="inputField input-lg" style="display: none"></select>
            <select id="selGenreBck" name="selGenreBck" runat="server" class="inputField input-lg" style="display: none"></select>
        </div>
        <div runat="server" id="divPlayer" style="display: none; overflow-x: hidden; margin-bottom: 16px; width:73%; margin-top:-35px">
            <div class="divProgressBar row">
                <audio src="" id="player"></audio>
                <div id="progressAmountBack" class="hp_slide divProgress col-12" style="cursor: pointer">
                    <div id="progressAmount" class="hp_range coloredText" style="cursor: pointer"></div>
                </div>
            </div>
            <div class="row divPlayerButtons" style="margin-top: 2px">
                <div id="butPrevTrack" class="divPrevTrackSec col-4" style="display: flex; justify-content: center;">
                    <a runat="server" id="aPrevTrack" href="javascript:void(0)" class="aPlayer aPrev" title="Previous" style="color: aliceblue; cursor: pointer; font-weight: bold; float: left"><i class="fa fa-angle-left"></i></a>
                </div>
                <div class="divPlayTrack col-4" style="display: flex; justify-content: center;">
                    <a runat="server" id="aPlayTrack" href="javascript:void(0)" class="aPlayer aPlay" title="Play" style="color: aliceblue; cursor: pointer; font-weight: bold;"><i class="fa fa-play"></i></a>
                    <a runat="server" id="aPauseTrack" href="javascript:void(0)" class="aPlayer aPause" title="Pause" style="color: aliceblue; display: none; cursor: pointer; font-weight: bold;"><i class="fa fa-pause"></i></a>
                </div>
                <div id="butNextTrack" class="divNextTrackSec col-4" style="display: flex; justify-content: center;">
                    <a runat="server" id="aNextTrack" href="javascript:void(0)" class="aPlayer aNext" title="Next" style="color: aliceblue; cursor: pointer; font-weight: bold;"><i class="fa fa-angle-right"></i></a>
                </div>
            </div>
        </div>

        <div runat="server" id="barNavSection" name="barNavSection" class="topnav" style="margin-top: 10px">
        </div>
        <div runat="server" id="filterBarSection" name="filterBar1" class="filternav barnav" style="margin-top: 1px">
        </div>
        <div runat="server" id="subFilterBarSection" name="filterBar2" class="subfilternav barnav" style="margin-top: 1px">
        </div>

        <div runat="server" id="contentContainer" name="contentContainer" style="margin-top: 10px">
            <div runat="server" id="contentSection" name="contentSection" class="content">
            </div>
        </div>
        <div id="unregisteredModal" class="modal fade">
            <div id='modalRegDataDiv' data-toggle='modal' data-target='#unregisteredModal' runat="server"></div>
            <div id='unRegModal' class="modal-dialog modal-dialog-centered modal-sm">
                <div id='subModalUnreg' class="modal-content" style="background-color: #121212">
                    <iframe id="unregisteredRegModal" src="/Forms/ItemRegistration.aspx" scrolling="no" style="width: 400px; height: 200px; border: none; border-radius: 10px"></iframe>
                </div>
            </div>
        </div>
    </form>
    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Navbar.js" type="text/javascript"></script>
    <script src="/JS/SectionBar.js" type="text/javascript"></script>
    <script src="/JS/Splide.min.js"></script>

    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    <script>
        var HeartBeatTimer;

        function StartHeartBeat() {
            // pulse every 5 seconds
            if (HeartBeatTimer == null)
                HeartBeatTimer = setInterval("HeartBeat()", 1000 * 30);
        }

        function HeartBeat() {
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/PokePage",
                data: JSON.stringify({
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                }
            });
        }

        StartHeartBeat();
    </script>
</body>
</html>
