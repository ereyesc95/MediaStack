$("body").addClass("dark-mode-main");

//Set Navegation Bar
$.get("/NavBar.html", function (data) {
    $("#nav-placeholder").replaceWith(data);
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Home.aspx/LoadNavBar",
        data: "",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (userData) {
            var userPath = userData.d.split(';')[0];
            var userName = userData.d.split(';')[1];
            var userRole = userData.d.split(';')[2];
            $("#menuButton").css({
                'background-image': 'url(' + userPath + ')'
            })
            $("#userOption").text(userName);

            if (userRole == '2') {
                $("#writeOption").css({
                    'display': 'block'
                });
            }
        }
    });
});

function writeData() {
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Home.aspx/Write_Data",
        data: "",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function () {
            window.location.replace("/Write");
        }
    });
}

function logout() {
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Home.aspx/Logout_Click",
        data: "",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function () {
            window.location.replace("/Login");
        }
    });
}